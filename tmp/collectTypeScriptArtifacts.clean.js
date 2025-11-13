  function collectTypeScriptArtifacts(ast, source, mapper) {
    const interfaces = [];
    const typeAliases = [];
    const enums = [];
    const namespaces = [];
    const typeOnlyImports = [];
    const typeOnlyExports = [];
    const decorators = [];
    const metadataFactories = [];
    const classModifiers = new Map();
    const memberModifiers = new Map();
    const ctorParameterProperties = new Map();
    const importModuleUsage = new Map();

    const worklist = [{ node: ast, context: {} }];
    const seen = new Set();

    function enqueue(node, context) {
      if (!node || typeof node !== 'object') {
        return;
      }
      worklist.push({ node, context: context || {} });
    }

    function enqueueAll(items, context) {
      if (!Array.isArray(items)) {
        return;
      }
      for (let index = items.length - 1; index >= 0; index -= 1) {
        const item = items[index];
        if (item && typeof item === 'object') {
          enqueue(item, context);
        }
      }
    }

    function pushChildrenGeneric(node, context) {
      Object.keys(node).forEach((key) => {
        if (key === 'span' || key === 'start' || key === 'end' || key === 'loc') {
          return;
        }
        const value = node[key];
        if (!value) {
          return;
        }
        if (Array.isArray(value)) {
          enqueueAll(value, context);
        } else if (typeof value === 'object') {
          enqueue(value, context);
        }
      });
    }

    function recordDecorators(targetKind, targetName, decoratorNodes, fallbackSpan) {
      if (!Array.isArray(decoratorNodes) || decoratorNodes.length === 0) {
        return [];
      }
      const names = [];
      decoratorNodes.forEach((decorator) => {
        if (!decorator || typeof decorator !== 'object') {
          return;
        }
        const name = extractDecoratorName(decorator);
        if (name) {
          names.push(name);
        }
        const span = normalizeNodeSpan(decorator, mapper) || fallbackSpan;
        const snippet = span ? extractCode(source, span, mapper) : '';
        decorators.push({
          target: targetKind,
          targetName,
          name,
          span,
          hash: createDigest(snippet || '')
        });
      });
      return names;
    }

    function extractImplementsList(items) {
      if (!Array.isArray(items) || items.length === 0) {
        return [];
      }
      const result = [];
      items.forEach((item) => {
        if (!item || typeof item !== 'object') {
          return;
        }
        const target = item.expression || item.id || item;
        const value = extractExpressionName(target);
        if (value) {
          result.push(value);
        }
      });
      return result;
    }

    function recordClassMetadata(node, context) {
      const className = node.identifier && node.identifier.value ? node.identifier.value : '(anonymous class)';
      const span = normalizeNodeSpan(node, mapper);
      const spanKey = span ? createSpanKey(span) : null;
      const extendsName = extractExpressionName(node.superClass);
      const implementsList = extractImplementsList(node.implements);
      const decoratorNames = recordDecorators('class', className, node.decorators, span);
      if (spanKey) {
        classModifiers.set(spanKey, {
          name: className,
          isAbstract: Boolean(node.isAbstract),
          decorators: decoratorNames,
          extends: extendsName,
          implements: implementsList
        });
      }
      const nextContext = {
        ...context,
        className,
        classSpan: span,
        classKey: spanKey
      };
      enqueue(node.superClass, nextContext);
      enqueue(node.typeParams, nextContext);
      enqueue(node.superTypeParams, nextContext);
      enqueueAll(node.implements, nextContext);
      if (Array.isArray(node.decorators)) {
        enqueueAll(node.decorators, nextContext);
      }
      const members = Array.isArray(node.body)
        ? node.body
        : (node.body && Array.isArray(node.body.body) ? node.body.body : []);
      members.forEach((member) => enqueue(member, nextContext));
    }

    function recordClassMember(node, context, kind) {
      const span = normalizeNodeSpan(node, mapper);
      const spanKey = span ? createSpanKey(span) : null;
      if (!spanKey) {
        return;
      }
      const className = context.className || null;
      let memberName;
      if (kind === 'constructor') {
        memberName = className ? `${className}.constructor` : 'constructor';
      } else {
        const propertyName = extractPropertyName(node.key);
        memberName = propertyName ? (className ? `${className}.${propertyName}` : propertyName) : null;
      }
      const decoratorNames = recordDecorators(kind, memberName || kind, node.decorators, span);
      const memberMeta = {
        name: memberName,
        kind,
        accessibility: node.accessibility || null,
        isAbstract: Boolean(node.isAbstract),
        isOverride: Boolean(node.isOverride || node.override),
        isStatic: Boolean(node.isStatic),
        decorators: decoratorNames
      };
      if (typeof node.readonly === 'boolean') {
        memberMeta.readonly = node.readonly;
      }
      if (typeof node.isOptional === 'boolean') {
        memberMeta.optional = node.isOptional;
      }
      if (typeof node.definite === 'boolean') {
        memberMeta.definite = node.definite;
      }
      if (node.typeAnnotation) {
        memberMeta.type = extractTypeAnnotationSnippet(node.typeAnnotation, source, mapper);
      }
      memberModifiers.set(spanKey, memberMeta);
      if (kind === 'constructor' && Array.isArray(node.params)) {
        const entries = [];
        node.params.forEach((param) => {
          if (!param || param.type !== 'TsParameterProperty') {
            return;
          }
          const paramName = param.param && param.param.type === 'Identifier' ? param.param.value : null;
          const parameterSpan = normalizeNodeSpan(param.param || param, mapper);
          const paramDecorators = recordDecorators('parameter-property', paramName || 'parameter', param.decorators, parameterSpan);
          const typeSnippet = param.param && param.param.typeAnnotation
            ? extractTypeAnnotationSnippet(param.param.typeAnnotation, source, mapper)
            : null;
          entries.push({
            name: paramName,
            accessibility: param.accessibility || null,
            readonly: Boolean(param.readonly),
            isOverride: Boolean(param.override),
            decorators: paramDecorators,
            type: typeSnippet
          });
        });
        if (entries.length > 0) {
          ctorParameterProperties.set(spanKey, entries);
        }
      }
    }

    function recordMetadataFactory(node) {
      const name = extractExpressionName(node.callee);
      if (name !== '__decorate' && name !== '__metadata') {
        return;
      }
      const span = normalizeNodeSpan(node, mapper);
      const snippet = span ? extractCode(source, span, mapper) : '';
      metadataFactories.push({
        name,
        span,
        hash: createDigest(snippet || '')
      });
    }

    while (worklist.length > 0) {
      const { node, context } = worklist.pop();
      if (!node || typeof node !== 'object') {
        continue;
      }
      if (seen.has(node)) {
        continue;
      }
      seen.add(node);

      switch (node.type) {
        case 'TsInterfaceDeclaration':
          recordDeclaration(interfaces, node, node.id ? node.id.value : null, mapper, source, 'interface');
          enqueue(node.body, context);
          break;
        case 'TsTypeAliasDeclaration':
          recordDeclaration(typeAliases, node, node.id ? node.id.value : null, mapper, source, 'type-alias');
          enqueue(node.typeAnnotation, context);
          break;
        case 'TsEnumDeclaration':
          recordDeclaration(enums, node, node.id ? node.id.value : null, mapper, source, 'enum');
          enqueueAll(node.members, context);
          break;
        case 'TsModuleDeclaration': {
          const moduleName = extractModuleName(node.id);
          recordDeclaration(namespaces, node, moduleName, mapper, source, 'namespace');
          if (node.body) {
            if (node.body.type === 'TsModuleBlock' && Array.isArray(node.body.body)) {
              enqueueAll(node.body.body, context);
            } else {
              enqueue(node.body, context);
            }
          }
          break;
        }
        case 'ImportDeclaration': {
          const moduleName = node.source && node.source.value ? node.source.value : null;
          if (moduleName) {
            const usage = importModuleUsage.get(moduleName) || { typeOnly: false, value: false };
            if (node.typeOnly) {
              usage.typeOnly = true;
            } else {
              usage.value = true;
            }
            importModuleUsage.set(moduleName, usage);
          }
          if (node.typeOnly) {
            typeOnlyImports.push({
              module: node.source && node.source.value ? node.source.value : '',
              specifiers: extractSpecifierNames(node.specifiers),
              span: normalizeNodeSpan(node, mapper)
            });
          }
          enqueue(node.source, context);
          enqueueAll(node.specifiers, context);
          if (node.asserts) {
            enqueue(node.asserts, context);
          }
          break;
        }
        case 'ExportNamedDeclaration':
          if (node.typeOnly) {
            typeOnlyExports.push({
              module: node.source && node.source.value ? node.source.value : null,
              specifiers: extractSpecifierNames(node.specifiers),
              span: normalizeNodeSpan(node, mapper)
            });
          }
          enqueue(node.source, context);
          enqueueAll(node.specifiers, context);
          enqueue(node.declaration || node.decl, context);
          break;
        case 'ClassDeclaration':
          recordClassMetadata(node, context);
          break;
        case 'ClassExpression':
          recordClassMetadata(node, context);
          break;
        case 'Constructor':
          recordClassMember(node, context, 'constructor');
          enqueueAll(node.params, context);
          enqueue(node.body, context);
          break;
        case 'ClassMethod':
        case 'ClassPrivateMethod':
          recordClassMember(node, context, 'method');
          if (node.function) {
            enqueue(node.function.body, context);
            enqueueAll(node.function.params, context);
            enqueue(node.function.returnType, context);
          }
          enqueue(node.key, context);
          break;
        case 'ClassProperty':
        case 'ClassPrivateProperty':
          recordClassMember(node, context, 'property');
          enqueue(node.key, context);
          enqueue(node.value, context);
          enqueue(node.typeAnnotation, context);
          break;
        case 'CallExpression':
          recordMetadataFactory(node);
          enqueue(node.callee, context);
          enqueueAll(node.arguments, context);
          enqueue(node.typeArguments, context);
          break;
        default:
          pushChildrenGeneric(node, context);
          break;
      }
    }

    return {
      interfaces,
      typeAliases,
      enums,
      namespaces,
      typeOnlyImports,
      typeOnlyExports,
      decorators,
      metadataFactories,
      classModifiers,
      memberModifiers,
      ctorParameterProperties,
      importModuleUsage
    };
  }
