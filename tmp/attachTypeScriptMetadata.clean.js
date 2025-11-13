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
