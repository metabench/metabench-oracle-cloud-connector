'use strict';

const {
  createFileRecord: createJsFileRecord
} = require('../../js-scan/lib/fileContext');
const {
  normalizeSpan,
  createSpanKey,
  extractCode,
  createDigest
} = require('../../../lib/swcTs');

function normalizeNodeSpan(node, mapper) {
  if (!node || !node.span) {
    return null;
  }
  return normalizeSpan(node.span, mapper);
}

function extractExpressionName(expression) {
  if (!expression || typeof expression !== 'object') {
    return null;
  }
  switch (expression.type) {
    case 'Identifier':
      return expression.value || null;
    case 'ThisExpression':
      return 'this';
    case 'Super':
      return 'super';
    case 'StringLiteral':
      return expression.value || null;
    case 'NumericLiteral':
      return String(expression.value);
    case 'PrivateName':
      if (expression.id && expression.id.name) {
        return `#${expression.id.name}`;
      }
      if (typeof expression.value === 'string' && expression.value.length > 0) {
        return `#${expression.value}`;
      }
      return null;
    case 'MemberExpression': {
      const parts = [];
      let current = expression;
      while (current && current.type === 'MemberExpression') {
        const property = current.property;
        let segment = null;
        if (property && property.type === 'Identifier') {
          segment = property.value;
        } else if (property && property.type === 'PrivateName') {
          segment = property.id && property.id.name ? `#${property.id.name}` : null;
        } else if (property && property.type === 'StringLiteral') {
          segment = property.value;
        } else if (property && property.type === 'NumericLiteral') {
          segment = String(property.value);
        }
        if (!segment) {
          return null;
        }
        parts.unshift(segment);
        const object = current.object;
        if (!object) {
          break;
        }
        if (object.type === 'Identifier') {
          parts.unshift(object.value);
          break;
        }
        if (object.type === 'ThisExpression') {
          parts.unshift('this');
          break;
        }
        if (object.type === 'Super') {
          parts.unshift('super');
          break;
        }
        current = object;
        if (current.type !== 'MemberExpression') {
          const tail = extractExpressionName(current);
          if (tail) {
            parts.unshift(tail);
            break;
          }
          break;
        }
      }
      return parts.length > 0 ? parts.join('.') : null;
    }
    case 'CallExpression':
      return extractExpressionName(expression.callee);
    case 'TsQualifiedName': {
      const left = extractExpressionName(expression.left);
      const right = extractExpressionName(expression.right);
      if (left && right) {
        return `${left}.${right}`;
      }
      return right || left;
    }
    default:
      return null;
  }
}

function extractModuleName(id) {
  if (!id || typeof id !== 'object') {
    return null;
  }
  if (id.type === 'Identifier') {
    return id.value || null;
  }
  if (id.type === 'StringLiteral') {
    return id.value || null;
  }
  return null;
}

function extractSpecifierNames(specifiers) {
  if (!Array.isArray(specifiers) || specifiers.length === 0) {
    return [];
  }
  const results = [];
  specifiers.forEach((spec) => {
    if (!spec || typeof spec !== 'object') {
      return;
    }
    if (spec.local && spec.local.value) {
      results.push(spec.local.value);
      return;
    }
    if (spec.orig && spec.orig.value) {
      results.push(spec.orig.value);
      return;
    }
    if (spec.exported && spec.exported.value) {
      results.push(spec.exported.value);
    }
  });
  return Array.from(new Set(results));
}

function extractPropertyName(key) {
  if (!key || typeof key !== 'object') {
    return null;
  }
  if (key.type === 'Identifier') {
    return key.value || null;
  }
  if (key.type === 'PrivateName') {
    if (key.id && key.id.name) {
      return `#${key.id.name}`;
    }
    if (typeof key.value === 'string' && key.value.length > 0) {
      return `#${key.value}`;
    }
  }
  if (key.type === 'StringLiteral') {
    return key.value || null;
  }
  if (key.type === 'NumericLiteral') {
    return String(key.value);
  }
  return null;
}

function extractDecoratorName(node) {
  if (!node || typeof node !== 'object') {
    return null;
  }
  if (node.type === 'Decorator') {
    return extractDecoratorName(node.expression || node.callee);
  }
  if (node.type === 'Identifier') {
    return node.value || null;
  }
  if (node.type === 'CallExpression') {
    return extractDecoratorName(node.callee);
  }
  if (node.type === 'MemberExpression') {
    return extractExpressionName(node);
  }
  return null;
}

function extractTypeAnnotationSnippet(node, source, mapper) {
  if (!node || typeof node !== 'object' || !node.span) {
    return null;
  }
  const span = normalizeSpan(node.span, mapper);
  if (!span) {
    return null;
  }
  return extractCode(source, span, mapper);
}

function recordDeclaration(list, node, name, mapper, source, kind) {
  if (!name) {
    return;
  }
  const span = normalizeNodeSpan(node, mapper);
  const snippet = span ? extractCode(source, span, mapper) : '';
  list.push({
    name,
    kind,
    span,
    hash: createDigest(snippet || '')
  });
}

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



function attachTypeScriptMetadata(record, metadata) {
  if (!record || !metadata) {
    return record;
  }
  const next = { ...record };
  next.language = 'typescript';
  next.ts = {
    interfaces: metadata.interfaces,
    typeAliases: metadata.typeAliases,
    enums: metadata.enums,
    namespaces: metadata.namespaces,
    typeOnlyImports: metadata.typeOnlyImports,
    typeOnlyExports: metadata.typeOnlyExports,
    decorators: metadata.decorators,
    metadataFactories: metadata.metadataFactories
  };

  if (
    metadata.importModuleUsage instanceof Map &&
    next.dependencies &&
    Array.isArray(next.dependencies.imports)
  ) {
    const typeOnlyModules = new Set();
    metadata.importModuleUsage.forEach((usage, moduleName) => {
      if (!moduleName) {
        return;
      }
      if (usage && usage.typeOnly && !usage.value) {
        typeOnlyModules.add(moduleName);
      }
    });
    if (typeOnlyModules.size > 0) {
      const originalImports = next.dependencies.imports;
      const filteredImports = originalImports.filter((moduleName) => !typeOnlyModules.has(moduleName));
      if (filteredImports.length !== originalImports.length) {
        next.dependencies = {
          ...next.dependencies,
          imports: filteredImports
        };
      }
    }
  }

  const matchedMemberSpans = new Set();
  next.functions = Array.isArray(record.functions)
    ? record.functions.map((fn) => {
        const updated = { ...fn };
        const spanKey = createSpanKey(fn.span);
        const tsPayload = {};
        if (spanKey && metadata.classModifiers.has(spanKey)) {
          Object.assign(tsPayload, metadata.classModifiers.get(spanKey));
        }
        if (spanKey && metadata.memberModifiers.has(spanKey)) {
          matchedMemberSpans.add(spanKey);
          Object.assign(tsPayload, metadata.memberModifiers.get(spanKey));
        }
        if (spanKey && metadata.ctorParameterProperties.has(spanKey)) {
          const props = metadata.ctorParameterProperties.get(spanKey) || [];
          tsPayload.parameterProperties = props.map((entry) => ({ ...entry }));
        }
        if (Object.keys(tsPayload).length > 0) {
          updated.ts = Object.assign({}, fn.ts || {}, tsPayload);
        }
        return updated;
      })
    : record.functions;

  const unattachedMembers = [];
  metadata.memberModifiers.forEach((value, key) => {
    if (!matchedMemberSpans.has(key)) {
      unattachedMembers.push({ spanKey: key, ...value });
    }
  });
  if (unattachedMembers.length > 0) {
    next.ts = Object.assign({}, next.ts, {
      members: unattachedMembers
    });
  }

  return next;
}


function createTsFileRecord({ filePath, rootDir, source, ast, functions, mapper }) {
  const baseRecord = createJsFileRecord({
    filePath,
    rootDir,
    source,
    ast,
    functions,
    mapper
  });
  const metadata = collectTypeScriptArtifacts(ast, source, mapper);
  return attachTypeScriptMetadata(baseRecord, metadata);
}

module.exports = {
  createTsFileRecord,
  collectTypeScriptArtifacts
};
