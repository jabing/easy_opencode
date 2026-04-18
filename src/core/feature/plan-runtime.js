const path = require('path');
const pathPosix = /** @type {{ dirname: (value: string) => string, relative: (from: string, to: string) => string, basename: (value: string) => string }} */ ((/** @type {any} */ (path)).posix || path);

/** @typedef {Record<string, any>} LooseRecord */
/** @typedef {{ controller_filename: string, service_filename: string, repository_filename: string, schema_filename: string, route_filename: string, test_filename: string, docs_filename: string }} FileNames */
const {
  authGuardSnippet,
  entrypointImportPath,
  featureFileName,
  goImportPath,
  relativeImport,
  relativePythonImport,
  repositoryPersistenceStatements,
  requestInputExpression,
  routeErrorHandling,
  routePathForStyle,
  routeResponseEnvelope,
  serviceErrorArtifacts,
  sharedErrorArtifacts,
  stripExtension,
  withDotPrefix,
} = require('./plan-shared.js');

/** @param {{ vars: LooseRecord, runtime: string, structure: LooseRecord, memory: LooseRecord, planning: LooseRecord, semantic: LooseRecord, paths: LooseRecord }} input */
function resolvePlanSettings({ vars, runtime, structure, memory, planning, semantic, paths }) {
  const conventions = structure?.conventions || {};
  const routeSuffix = conventions.route_suffix || '.route.ts';
  const testSuffix = conventions.test_suffix || '.spec.ts';
  const implementationStyle = String(planning?.implementation_style || vars['project.implementation_style'] || memory?.coding_style || 'functional').trim();
  const schemaStyle = String(planning?.schema_style || vars['project.schema_style'] || 'typed-interface').trim();
  const routeStyle = String(planning?.route_style || vars['project.route_style'] || 'rest-endpoint').trim();
  const authMode = String(planning?.auth_mode || vars['project.auth_mode'] || 'open').trim();
  const repositoryStyle = String(planning?.repository_style || vars['project.repository_style'] || 'generic-repository').trim();
  const errorStyle = String(planning?.error_style || vars['project.error_style'] || 'standard-errors').trim();
  const testTemplateStyle = String(planning?.test_template_style || vars['project.test_template_style'] || 'node-test').trim();
  const fileNames = resolveFileNames({ vars, runtime, routeSuffix, testSuffix });
  const routeDir = String(paths.route || '').replace(/\\/g, '/');
  const routeIndexDir = pathPosix.dirname(String(paths.route_index || '').replace(/\\/g, '/'));
  const routeFilePath = `${routeDir}/${fileNames.route_filename}`;
  const routeExportTarget = withDotPrefix(stripExtension(pathPosix.relative(routeIndexDir, routeFilePath)));
  const testDir = String(paths.test || '').replace(/\\/g, '/');
  const featureRoot = String(paths.feature_root || `src/features/${vars.kebab_name}`).replace(/\\/g, '/');
  const imports = buildImports({ paths, fileNames, testDir, memory, routeFilePath });
  applyCommonTemplateVars({ vars, paths, fileNames, schemaStyle, routeStyle, authMode, repositoryStyle, errorStyle, memory, semantic, imports });
  if (runtime === 'python') {
    applyPythonTemplateVars({ vars, paths, fileNames, structure, semantic, authMode, routeDir, imports });
  }
  if (runtime === 'go') {
    applyGoTemplateVars({ vars, paths, structure, semantic, authMode });
  }
  return {
    authMode,
    errorStyle,
    featureRoot,
    fileNames,
    implementationStyle,
    imports,
    repositoryStyle,
    routeExportTarget,
    routeStyle,
    schemaStyle,
    testTemplateStyle,
  };
}

/** @param {{ vars: LooseRecord, runtime: string, routeSuffix: string, testSuffix: string }} input @returns {FileNames} */
function resolveFileNames({ vars, runtime, routeSuffix, testSuffix }) {
  if (runtime === 'python') {
    return {
      controller_filename: `${vars.snake_name}_controller.py`,
      service_filename: `${vars.snake_name}_service.py`,
      repository_filename: `${vars.snake_name}_repository.py`,
      schema_filename: `${vars.snake_name}_schema.py`,
      route_filename: `${vars.snake_name}${routeSuffix}`,
      test_filename: `${vars.snake_name}${testSuffix}`,
      docs_filename: `${vars.kebab_name}.md`,
    };
  }
  if (runtime === 'go') {
    return {
      controller_filename: `${vars.snake_name}_handler.go`,
      service_filename: `${vars.snake_name}_service.go`,
      repository_filename: `${vars.snake_name}_repository.go`,
      schema_filename: `${vars.snake_name}_model.go`,
      route_filename: `${vars.snake_name}${routeSuffix}`,
      test_filename: `${vars.snake_name}${testSuffix}`,
      docs_filename: `${vars.kebab_name}.md`,
    };
  }
  return {
    controller_filename: featureFileName(vars.kebab_name, '.controller.ts', '.controller.ts'),
    service_filename: featureFileName(vars.kebab_name, '.service.ts', '.service.ts'),
    repository_filename: featureFileName(vars.kebab_name, '.repository.ts', '.repository.ts'),
    schema_filename: featureFileName(vars.kebab_name, '.schema.ts', '.schema.ts'),
    route_filename: featureFileName(vars.kebab_name, routeSuffix, '.route.ts'),
    test_filename: featureFileName(vars.kebab_name, testSuffix, '.spec.ts'),
    docs_filename: `${vars.kebab_name}.md`,
  };
}

/** @param {{ paths: LooseRecord, fileNames: FileNames, testDir: string, memory: LooseRecord, routeFilePath: string }} input */
function buildImports({ paths, fileNames, testDir, memory, routeFilePath }) {
  return {
    import_service_from_controller: relativeImport(paths.controller, `${String(paths.service || '').replace(/\\/g, '/')}/${fileNames.service_filename}`),
    import_schema_from_controller: relativeImport(paths.controller, `${String(paths.schema || '').replace(/\\/g, '/')}/${fileNames.schema_filename}`),
    import_schema_from_service: relativeImport(paths.service, `${String(paths.schema || '').replace(/\\/g, '/')}/${fileNames.schema_filename}`),
    import_repository_from_service: relativeImport(paths.service, `${String(paths.repository || '').replace(/\\/g, '/')}/${fileNames.repository_filename}`),
    import_schema_from_repository: relativeImport(paths.repository, `${String(paths.schema || '').replace(/\\/g, '/')}/${fileNames.schema_filename}`),
    import_controller_from_route: relativeImport(paths.route, `${String(paths.controller || '').replace(/\\/g, '/')}/${fileNames.controller_filename}`),
    import_schema_runtime_from_route: relativeImport(paths.route, `${String(paths.schema || '').replace(/\\/g, '/')}/${fileNames.schema_filename}`),
    import_service_from_test: relativeImport(testDir, `${String(paths.service || '').replace(/\\/g, '/')}/${fileNames.service_filename}`),
    import_route_from_entrypoint: memory?.app_entrypoint?.module_path ? entrypointImportPath(memory.app_entrypoint.module_path, routeFilePath) : '',
  };
}

/** @param {{ vars: LooseRecord, paths: LooseRecord, fileNames: FileNames, schemaStyle: string, routeStyle: string, authMode: string, repositoryStyle: string, errorStyle: string, memory: LooseRecord, semantic: LooseRecord, imports: LooseRecord }} input */
function applyCommonTemplateVars({ vars, paths, fileNames, schemaStyle, routeStyle, authMode, repositoryStyle, errorStyle, memory, semantic, imports }) {
  vars['project.schema_style'] = schemaStyle;
  vars['project.route_style'] = routeStyle;
  vars['project.auth_mode'] = authMode;
  vars['project.repository_style'] = repositoryStyle;
  vars['project.error_style'] = errorStyle;
  vars['project.test_template_style'] = String(vars['project.test_template_style'] || 'node-test');
  vars['project.shared_error_integration'] = memory?.shared_error_module && memory.shared_error_module.class_name && memory.shared_error_module.module_path ? `${memory.shared_error_module.class_name}@${memory.shared_error_module.module_path}` : 'feature-local';
  vars['project.global_error_handler_integration'] = memory?.global_error_middleware && memory.global_error_middleware.symbol_name && memory.global_error_middleware.module_path ? `${memory.global_error_middleware.symbol_name}@${memory.global_error_middleware.module_path}` : 'none-detected';
  vars['project.app_entrypoint_integration'] = memory?.app_entrypoint && memory.app_entrypoint.module_path ? `${memory.app_entrypoint.module_path}${memory.app_entrypoint.registers_global_error_handler ? ' (registered)' : ' (not-registered)'}` : 'none-detected';
  vars['project.preferred_test_command_ci'] = memory?.preferred_test_commands?.ci || memory?.preferred_test_command || '';
  vars.import_route_from_entrypoint = imports.import_route_from_entrypoint;
  vars['project.preferred_test_command_watch'] = memory?.preferred_test_commands?.watch || '';
  vars['project.preferred_test_command_coverage'] = memory?.preferred_test_commands?.coverage || '';
  vars['project.preferred_test_runner_profile'] = memory?.preferred_test_runner_profile ? JSON.stringify(memory.preferred_test_runner_profile) : '{}';
  const styledRoutePath = routePathForStyle(routeStyle, vars.kebab_name);
  vars.route_path = String(routeStyle === 'rest-endpoint' ? (vars['project.semantic.route_namespace'] || semantic.route_namespace || styledRoutePath) : styledRoutePath);
  vars.request_input_expression = requestInputExpression(routeStyle);
  vars.route_response_statement = routeResponseEnvelope(routeStyle);
  vars.auth_guard_block = authGuardSnippet(authMode, '      ');
  vars.runtime_schema_import = schemaStyle === 'zod-first'
    ? `import { ${vars.pascal_name}PayloadSchema } from '${imports.import_schema_runtime_from_route}';`
    : `import type { ${vars.pascal_name}Payload } from '${imports.import_schema_runtime_from_route}';`;
  vars.payload_binding_statement = schemaStyle === 'zod-first'
    ? `const payload = ${vars.pascal_name}PayloadSchema.parse(${vars.request_input_expression});`
    : `const payload = (${vars.request_input_expression}) as ${vars.pascal_name}Payload;`;
  vars.controller_schema_import_statement = `import type { ${vars.pascal_name}Payload } from '${imports.import_schema_from_controller}';`;
  vars.service_schema_import_statement = `import type { ${vars.pascal_name}Payload } from '${imports.import_schema_from_service}';`;
  vars.repository_schema_import_statement = `import type { ${vars.pascal_name}Payload } from '${imports.import_schema_from_repository}';`;
  const repositoryPersistence = repositoryPersistenceStatements(repositoryStyle, vars.pascal_name);
  const sharedErrors = sharedErrorArtifacts(errorStyle, memory, paths, fileNames, vars);
  const serviceErrors = serviceErrorArtifacts(errorStyle, vars.pascal_name, sharedErrors.serviceBaseClass);
  vars.repository_runtime_import_statement = repositoryPersistence.imports;
  vars.repository_persistence_statement = repositoryPersistence.body;
  vars.service_error_import_statement = sharedErrors.serviceImport;
  vars.service_error_declaration = serviceErrors.declarations;
  vars.service_input_guard = serviceErrors.guard;
  vars.route_service_error_import = errorStyle === 'typed-errors'
    ? [
        `import { ${vars.pascal_name}ServiceError } from '${relativeImport(paths.route, `${String(paths.service || '').replace(/\\/g, '/')}/${fileNames.service_filename}`)}';`,
        sharedErrors.routeImport,
      ].filter(Boolean).join('\n')
    : '';
  vars.route_error_handler_statement = routeErrorHandling(errorStyle, vars.pascal_name, sharedErrors, memory?.global_error_middleware || null);
}

/** @param {{ vars: LooseRecord, paths: LooseRecord, fileNames: FileNames, structure: LooseRecord, semantic: LooseRecord, authMode: string, routeDir?: string, imports?: LooseRecord }} input */
function applyPythonTemplateVars({ vars, paths, fileNames, structure, semantic, authMode, routeDir: _routeDir = '', imports: _imports = {} }) {
  const sourceRoot = String(structure?.source_root || '.').replace(/\\/g, '/');
  const routeDir = String(paths.route || '').replace(/\\/g, '/');
  vars.python_import_controller = relativePythonImport(paths.route, `${String(paths.controller || '').replace(/\\/g, '/')}/${fileNames.controller_filename}`, sourceRoot);
  vars.python_import_service = relativePythonImport(paths.route, `${String(paths.service || '').replace(/\\/g, '/')}/${fileNames.service_filename}`, sourceRoot);
  vars.python_import_service_from_controller = relativePythonImport(paths.controller, `${String(paths.service || '').replace(/\\/g, '/')}/${fileNames.service_filename}`, sourceRoot);
  vars.python_import_repository = relativePythonImport(paths.service, `${String(paths.repository || '').replace(/\\/g, '/')}/${fileNames.repository_filename}`, sourceRoot);
  vars.python_import_schema = relativePythonImport(paths.route, `${String(paths.schema || '').replace(/\\/g, '/')}/${fileNames.schema_filename}`, sourceRoot);
  vars.python_schema_controller_import = relativePythonImport(paths.controller, `${String(paths.schema || '').replace(/\\/g, '/')}/${fileNames.schema_filename}`, sourceRoot);
  vars.python_schema_service_import = relativePythonImport(paths.service, `${String(paths.schema || '').replace(/\\/g, '/')}/${fileNames.schema_filename}`, sourceRoot);
  vars.python_schema_repository_import = relativePythonImport(paths.repository, `${String(paths.schema || '').replace(/\\/g, '/')}/${fileNames.schema_filename}`, sourceRoot);
  vars.python_feature_tag = vars.kebab_name;
  vars.python_route_prefix = String(vars['project.semantic.route_namespace'] || semantic.python_route_prefix || `/${vars.kebab_name}`);
  vars.python_route_summary = `Create ${vars.subject}`;
  vars.python_dependency_factory = `get_${vars.snake_name}_controller`;
  vars.python_service_dependency_factory = `get_${vars.snake_name}_service`;
  vars.python_repository_dependency_factory = `get_${vars.snake_name}_repository`;
  vars.python_auth_dependency_name = `require_${vars.snake_name}_access`;
  vars.python_router_dependencies = authMode !== 'open' ? `, dependencies=[Depends(${vars.python_auth_dependency_name})]` : '';
  vars.python_auth_dependency_block = authMode !== 'open'
    ? `\ndef ${vars.python_auth_dependency_name}() -> None:\n    return None\n`
    : '';
  vars.python_router_symbol = `${vars.camel_name}_router`;
  vars.python_router_import = relativePythonImport(pathPosix.dirname(String(paths.route_index || '').replace(/\\/g, '/')), `${routeDir}/${fileNames.route_filename}`, sourceRoot);
  vars.python_include_router_import = `from ${vars.python_router_import} import router as ${vars.python_router_symbol}`;
  vars.python_include_router_call = `app.include_router(${vars.python_router_symbol})`;
}

/** @param {{ vars: LooseRecord, paths: LooseRecord, structure: LooseRecord, semantic: LooseRecord, authMode: string }} input */
function applyGoTemplateVars({ vars, paths, structure, semantic, authMode }) {
  const routePackage = pathPosix.basename(String(paths.route || 'handlers').replace(/\\/g, '/')) || 'handlers';
  const servicePackage = pathPosix.basename(String(paths.service || 'services').replace(/\\/g, '/')) || 'services';
  const repositoryPackage = pathPosix.basename(String(paths.repository || 'repositories').replace(/\\/g, '/')) || 'repositories';
  const schemaPackage = pathPosix.basename(String(paths.schema || 'models').replace(/\\/g, '/')) || 'models';
  const goFramework = String(vars.framework || vars['project.framework'] || structure?.framework || 'go').trim() || 'go';
  const goModulePath = String(vars['project.go_module_path'] || vars.go_module_path || '').trim();
  vars.go_framework = goFramework;
  vars.go_route_package = routePackage;
  vars.go_service_package = servicePackage;
  vars.go_repository_package = repositoryPackage;
  vars.go_schema_package = schemaPackage;
  vars.go_route_register_function = `Register${vars.pascal_name}Routes`;
  vars.go_handler_type = `${vars.pascal_name}Handler`;
  vars.go_service_type = `${vars.pascal_name}Service`;
  vars.go_repository_type = `${vars.pascal_name}Repository`;
  vars.go_model_type = `${vars.pascal_name}Record`;
  vars.go_input_type = `${vars.pascal_name}Input`;
  vars.go_handler_import_path = goImportPath(goModulePath, paths.route || routePackage);
  vars.go_service_import_path = goImportPath(goModulePath, paths.service || servicePackage);
  vars.go_repository_import_path = goImportPath(goModulePath, paths.repository || repositoryPackage);
  vars.go_schema_import_path = goImportPath(goModulePath, paths.schema || schemaPackage);
  vars.go_route_mount_path = String(vars['project.semantic.route_namespace'] || semantic.go_route_mount_path || `/${vars.kebab_name}`);
  vars.go_handler_constructor = `New${vars.pascal_name}Handler`;
  vars.go_service_constructor = `New${vars.pascal_name}Service`;
  vars.go_repository_constructor = `New${vars.pascal_name}Repository`;
  vars.go_route_index_import = '';
  vars.go_route_register_call = `${vars.go_route_register_function}(${goFramework === 'fiber' ? 'app' : 'router'})`;
  vars.go_controller_imports_block = goFramework === 'gin'
    ? `\t"net/http"\n\t"github.com/gin-gonic/gin"`
    : goFramework === 'fiber'
      ? `\t"github.com/gofiber/fiber/v2"`
      : `\t"encoding/json"\n\t"net/http"`;
  vars.go_route_framework_import = goFramework === 'gin'
    ? `\t"github.com/gin-gonic/gin"`
    : goFramework === 'chi'
      ? `\t"github.com/go-chi/chi/v5"`
      : goFramework === 'fiber'
        ? `\t"github.com/gofiber/fiber/v2"`
        : `\t"net/http"`;
  vars.go_test_imports_block = goFramework === 'gin'
    ? `\t"net/http"\n\t"net/http/httptest"\n\t"testing"\n\t"github.com/gin-gonic/gin"`
    : goFramework === 'chi'
      ? `\t"net/http"\n\t"net/http/httptest"\n\t"testing"\n\t"github.com/go-chi/chi/v5"`
      : goFramework === 'fiber'
        ? `\t"net/http"\n\t"net/http/httptest"\n\t"testing"\n\t"github.com/gofiber/fiber/v2"`
        : `\t"net/http"\n\t"net/http/httptest"\n\t"testing"`;
  vars.go_controller_signature = goFramework === 'gin'
    ? `(handler *${vars.go_handler_type}) Create(ctx *gin.Context)`
    : goFramework === 'fiber'
      ? `(handler *${vars.go_handler_type}) Create(ctx *fiber.Ctx) error`
      : `(handler *${vars.go_handler_type}) Create(w http.ResponseWriter, r *http.Request)`;
  vars.go_method_guard = goFramework === 'go' || goFramework === 'chi'
    ? `\tif r.Method != http.MethodPost {\n\t\tw.WriteHeader(http.StatusMethodNotAllowed)\n\t\treturn\n\t}`
    : '';
  vars.go_decode_input_block = goFramework === 'gin'
    ? `\tvar input ${schemaPackage}.${vars.go_input_type}\n\tif err := ctx.ShouldBindJSON(&input); err != nil {\n\t\tctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})\n\t\treturn\n\t}`
    : goFramework === 'fiber'
      ? `\tvar input ${schemaPackage}.${vars.go_input_type}\n\tif err := ctx.BodyParser(&input); err != nil {\n\t\treturn ctx.Status(fiber.StatusBadRequest).JSON(map[string]string{"error": err.Error()})\n\t}`
      : `\tdefer r.Body.Close()\n\tvar input ${schemaPackage}.${vars.go_input_type}\n\tif err := json.NewDecoder(r.Body).Decode(&input); err != nil {\n\t\thttp.Error(w, err.Error(), http.StatusBadRequest)\n\t\treturn\n\t}`;
  vars.go_success_response_block = goFramework === 'gin'
    ? `\trecord := handler.service.Create(input)\n\tctx.JSON(http.StatusCreated, record)`
    : goFramework === 'fiber'
      ? `\trecord := handler.service.Create(input)\n\treturn ctx.Status(fiber.StatusCreated).JSON(record)`
      : `\trecord := handler.service.Create(input)\n\tw.Header().Set("Content-Type", "application/json")\n\tw.WriteHeader(http.StatusCreated)\n\t_ = json.NewEncoder(w).Encode(record)`;
  vars.go_controller_return_tail = goFramework === 'fiber' ? `\n\treturn nil` : '';
  vars.go_route_registration_signature = goFramework === 'gin'
    ? `(router gin.IRouter)`
    : goFramework === 'chi'
      ? `(router chi.Router)`
      : goFramework === 'fiber'
        ? `(app fiber.Router)`
        : `(mux *http.ServeMux)`;
  vars.go_route_logging_middleware = `${vars.pascal_name}Middleware`;
  vars.go_route_auth_middleware = `${vars.pascal_name}RequireAuth`;
  vars.go_route_middleware_helpers = goFramework === 'gin'
    ? `func ${vars.go_route_logging_middleware}() gin.HandlerFunc {\n\treturn func(ctx *gin.Context) {\n\t\tctx.Next()\n\t}\n}\n\n${authMode !== 'open' ? `func ${vars.go_route_auth_middleware}() gin.HandlerFunc {\n\treturn func(ctx *gin.Context) {\n\t\tctx.Next()\n\t}\n}` : ''}`
    : goFramework === 'chi'
      ? `func ${vars.go_route_logging_middleware}(next http.Handler) http.Handler {\n\treturn http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {\n\t\tnext.ServeHTTP(w, r)\n\t})\n}\n\n${authMode !== 'open' ? `func ${vars.go_route_auth_middleware}(next http.Handler) http.Handler {\n\treturn http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {\n\t\tnext.ServeHTTP(w, r)\n\t})\n}` : ''}`
      : goFramework === 'fiber'
        ? `func ${vars.go_route_logging_middleware}() fiber.Handler {\n\treturn func(ctx *fiber.Ctx) error {\n\t\treturn ctx.Next()\n\t}\n}\n\n${authMode !== 'open' ? `func ${vars.go_route_auth_middleware}() fiber.Handler {\n\treturn func(ctx *fiber.Ctx) error {\n\t\treturn ctx.Next()\n\t}\n}` : ''}`
        : '';
  vars.go_route_registration_statement = goFramework === 'gin'
    ? `\tgroup := router.Group("${vars.go_route_mount_path}")\n\tgroup.Use(${vars.go_route_logging_middleware}())${authMode !== 'open' ? `\n\tgroup.Use(${vars.go_route_auth_middleware}())` : ''}\n\tgroup.POST("", handler.Create)`
    : goFramework === 'chi'
      ? `\trouter.Route("${vars.go_route_mount_path}", func(r chi.Router) {\n\t\tr.Use(${vars.go_route_logging_middleware})${authMode !== 'open' ? `\n\t\tr.Use(${vars.go_route_auth_middleware})` : ''}\n\t\tr.Post("/", handler.Create)\n\t})`
      : goFramework === 'fiber'
        ? `\tgroup := app.Group("${vars.go_route_mount_path}", ${vars.go_route_logging_middleware}()${authMode !== 'open' ? `, ${vars.go_route_auth_middleware}()` : ''})\n\tgroup.Post("/", handler.Create)`
        : `\tmux.HandleFunc("${vars.go_route_mount_path}", handler.Create)`;
  vars.go_test_router_setup = goFramework === 'gin'
    ? `\tgin.SetMode(gin.TestMode)\n\trouter := gin.New()\n\t${vars.go_route_register_function}(router)`
    : goFramework === 'chi'
      ? `\trouter := chi.NewRouter()\n\t${vars.go_route_register_function}(router)`
      : goFramework === 'fiber'
        ? `\tapp := fiber.New()\n\t${vars.go_route_register_function}(app)`
        : `\tmux := http.NewServeMux()\n\t${vars.go_route_register_function}(mux)`;
  vars.go_test_execute_block = goFramework === 'fiber'
    ? `\tresponse, err := app.Test(request)\n\tif err != nil {\n\t\tt.Fatalf("expected request to succeed: %v", err)\n\t}\n\tif response.StatusCode != http.StatusCreated {\n\t\tt.Fatalf("expected status %d, got %d", http.StatusCreated, response.StatusCode)\n\t}`
    : goFramework === 'gin' || goFramework === 'chi'
      ? `\trecorder := httptest.NewRecorder()\n\trouter.ServeHTTP(recorder, request)\n\tif recorder.Code != http.StatusCreated {\n\t\tt.Fatalf("expected status %d, got %d", http.StatusCreated, recorder.Code)\n\t}`
      : `\trecorder := httptest.NewRecorder()\n\tmux.ServeHTTP(recorder, request)\n\tif recorder.Code != http.StatusCreated {\n\t\tt.Fatalf("expected status %d, got %d", http.StatusCreated, recorder.Code)\n\t}`;
}

/** @param {LooseRecord[]} orderedModules @param {string} runtime @param {{ schemaStyle: string, routeStyle: string, authMode: string, errorStyle: string, implementationStyle: string, testTemplateStyle: string }} options */
function styleOrderedModules(orderedModules, runtime, { schemaStyle, routeStyle, authMode, errorStyle, implementationStyle, testTemplateStyle }) {
  return orderedModules.map((moduleDef) => {
    const id = String(moduleDef.id || '').trim();
    if (runtime === 'node' && id === 'schema' && schemaStyle === 'zod-first') {
      return { ...moduleDef, template: 'feature/schema.zod.ts.tpl' };
    }
    if (runtime === 'node' && id === 'route' && (routeStyle !== 'rest-endpoint' || schemaStyle === 'zod-first' || authMode !== 'open' || errorStyle !== 'standard-errors')) {
      return { ...moduleDef, template: 'feature/route.api-aware.ts.tpl' };
    }
    if (runtime === 'node' && id === 'test' && testTemplateStyle === 'vitest') {
      return { ...moduleDef, template: 'feature/test.vitest.ts.tpl' };
    }
    if (runtime === 'node' && id === 'test' && testTemplateStyle === 'jest') {
      return { ...moduleDef, template: 'feature/test.jest.ts.tpl' };
    }
    if (runtime === 'node' && implementationStyle === 'class-based' && ['controller', 'service', 'repository'].includes(id)) {
      return { ...moduleDef, template: `feature/class-based/${id}.ts.tpl` };
    }
    return moduleDef;
  });
}

/** @param {{ vars: LooseRecord, orderedModules: LooseRecord[], enabledIds: Set<string>, paths: LooseRecord, fileNames: FileNames }} input */
function applyGeneratedFilesSummary({ vars, orderedModules, enabledIds, paths, fileNames }) {
  const enabledModuleIds = orderedModules.map((moduleDef) => String(moduleDef.id || '').trim()).filter(Boolean);
  const generatedFiles = [];
  if (enabledIds.has('controller')) generatedFiles.push(`- \`${paths.controller}/${fileNames.controller_filename}\``);
  if (enabledIds.has('service')) generatedFiles.push(`- \`${paths.service}/${fileNames.service_filename}\``);
  if (enabledIds.has('repository')) generatedFiles.push(`- \`${paths.repository}/${fileNames.repository_filename}\``);
  if (enabledIds.has('schema')) generatedFiles.push(`- \`${paths.schema}/${fileNames.schema_filename}\``);
  if (enabledIds.has('route')) generatedFiles.push(`- \`${paths.route}/${fileNames.route_filename}\``);
  if (enabledIds.has('test')) generatedFiles.push(`- \`${paths.test}/${fileNames.test_filename}\``);
  if (enabledIds.has('docs')) generatedFiles.push(`- \`${paths.docs}/${fileNames.docs_filename}\``);
  if (enabledIds.has('integration')) generatedFiles.push(`- \`.opencode/feature-bundles/${vars.kebab_name}.integration.md\``);
  vars.generated_files_list = generatedFiles.join('\n');
  vars.generated_files_markdown = generatedFiles.join('\n');
  vars.enabled_modules = enabledModuleIds.join(', ');
}

/** @param {LooseRecord} vars @param {LooseRecord} semantic */
function buildTemplateVars(vars, semantic) {
  return {
    route_path: vars.route_path,
    request_input_expression: vars.request_input_expression,
    route_response_statement: vars.route_response_statement,
    auth_guard_block: vars.auth_guard_block,
    runtime_schema_import: vars.runtime_schema_import,
    payload_binding_statement: vars.payload_binding_statement,
    controller_schema_import_statement: vars.controller_schema_import_statement,
    service_schema_import_statement: vars.service_schema_import_statement,
    repository_schema_import_statement: vars.repository_schema_import_statement,
    repository_runtime_import_statement: vars.repository_runtime_import_statement,
    repository_persistence_statement: vars.repository_persistence_statement,
    service_error_import_statement: vars.service_error_import_statement,
    service_error_declaration: vars.service_error_declaration,
    service_input_guard: vars.service_input_guard,
    route_service_error_import: vars.route_service_error_import,
    route_error_handler_statement: vars.route_error_handler_statement,
    generated_files_markdown: vars.generated_files_markdown,
    semantic_family: semantic.family,
    semantic_tags: (semantic.semantic_tags || []).join(', '),
    semantic_operation_hints: (semantic.operation_hints || []).join(', '),
    python_import_controller: vars.python_import_controller,
    python_import_service: vars.python_import_service,
    python_import_service_from_controller: vars.python_import_service_from_controller,
    python_import_repository: vars.python_import_repository,
    python_import_schema: vars.python_import_schema,
    python_schema_controller_import: vars.python_schema_controller_import,
    python_schema_service_import: vars.python_schema_service_import,
    python_schema_repository_import: vars.python_schema_repository_import,
    python_feature_tag: vars.python_feature_tag,
    python_route_prefix: vars.python_route_prefix,
    python_route_summary: vars.python_route_summary,
    python_router_symbol: vars.python_router_symbol,
    python_router_import: vars.python_router_import,
    python_dependency_factory: vars.python_dependency_factory,
    python_service_dependency_factory: vars.python_service_dependency_factory,
    python_repository_dependency_factory: vars.python_repository_dependency_factory,
    python_router_dependencies: vars.python_router_dependencies,
    python_auth_dependency_name: vars.python_auth_dependency_name,
    python_auth_dependency_block: vars.python_auth_dependency_block,
    python_include_router_import: vars.python_include_router_import,
    python_include_router_call: vars.python_include_router_call,
    go_route_package: vars.go_route_package,
    go_service_package: vars.go_service_package,
    go_repository_package: vars.go_repository_package,
    go_schema_package: vars.go_schema_package,
    go_route_register_function: vars.go_route_register_function,
    go_handler_type: vars.go_handler_type,
    go_service_type: vars.go_service_type,
    go_repository_type: vars.go_repository_type,
    go_model_type: vars.go_model_type,
    go_input_type: vars.go_input_type,
    go_handler_import_path: vars.go_handler_import_path,
    go_service_import_path: vars.go_service_import_path,
    go_repository_import_path: vars.go_repository_import_path,
    go_schema_import_path: vars.go_schema_import_path,
    go_route_mount_path: vars.go_route_mount_path,
    go_handler_constructor: vars.go_handler_constructor,
    go_service_constructor: vars.go_service_constructor,
    go_repository_constructor: vars.go_repository_constructor,
    go_route_index_import: vars.go_route_index_import,
    go_route_register_call: vars.go_route_register_call,
    go_framework: vars.go_framework,
    go_route_framework_import: vars.go_route_framework_import,
    go_controller_imports_block: vars.go_controller_imports_block,
    go_controller_signature: vars.go_controller_signature,
    go_method_guard: vars.go_method_guard,
    go_decode_input_block: vars.go_decode_input_block,
    go_success_response_block: vars.go_success_response_block,
    go_controller_return_tail: vars.go_controller_return_tail,
    go_route_registration_signature: vars.go_route_registration_signature,
    go_route_registration_statement: vars.go_route_registration_statement,
    go_route_middleware_helpers: vars.go_route_middleware_helpers,
    go_test_imports_block: vars.go_test_imports_block,
    go_test_router_setup: vars.go_test_router_setup,
    go_test_execute_block: vars.go_test_execute_block,
  };
}

module.exports = {
  applyGeneratedFilesSummary,
  buildTemplateVars,
  resolvePlanSettings,
  styleOrderedModules,
};
