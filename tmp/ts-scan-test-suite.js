() => {
  it('collects TypeScript-specific metadata for sample fixtures', () => {
    const fixtureDir = getFixturePath();
    const result = scanWorkspace({
      dir: fixtureDir,
      rootDir: fixtureDir
    });

    expect(Array.isArray(result.files)).toBe(true);
    const sampleRecord = result.files.find((file) => file.filePath.endsWith('sample.ts'));
    expect(sampleRecord).toBeDefined();
    if (!sampleRecord) {
      return;
    }

    expect(sampleRecord.language).toBe('typescript');
    expect(sampleRecord.ts).toBeDefined();
    expect(sampleRecord.ts.interfaces.map((entry) => entry.name)).toContain('User');
    expect(sampleRecord.ts.typeOnlyImports.map((entry) => entry.module)).toContain('./types');
    expect(sampleRecord.ts.typeOnlyExports.map((entry) => entry.module)).toContain('./types');
    expect(sampleRecord.ts.metadataFactories.map((entry) => entry.name)).toEqual(
      expect.arrayContaining(['__decorate', '__metadata'])
    );

    const classRecord = sampleRecord.functions.find(
      (fn) => fn.kind === 'class' && fn.name === 'ExampleService'
    );
    expect(classRecord).toBeDefined();
    expect(classRecord?.ts?.decorators).toEqual(expect.arrayContaining(['Injectable', 'Component']));

    const constructorRecord = sampleRecord.functions.find(
      (fn) => fn.kind === 'class-method' && fn.name === 'ExampleService.constructor'
    );
    expect(constructorRecord).toBeDefined();
    expect(constructorRecord.ts?.parameterProperties).toBeDefined();
    expect(constructorRecord.ts?.parameterProperties).toHaveLength(2);
    expect(constructorRecord.ts?.parameterProperties?.[0]).toEqual(
      expect.objectContaining({ accessibility: 'private', readonly: true })
    );

    const importModules = sampleRecord.dependencies.imports || [];
    expect(importModules).toHaveLength(0);
    expect(importModules).not.toContain('./types');

    const unattachedMembers = sampleRecord.ts.members || [];
    const valueMember = unattachedMembers.find((member) => member.name === 'ExampleService.value');
    expect(valueMember).toBeDefined();
    expect(valueMember?.decorators).toEqual(expect.arrayContaining(['Input']));
    const configMember = unattachedMembers.find((member) => member.name === 'ExampleService.config');
    expect(configMember?.readonly).toBe(true);
  });
}
