const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { runNodeJson, withTempDir, writeFiles } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const ANALYZE = path.join(ROOT, 'scripts', 'analyze-project-structure.js');
const GENERATE_FEATURE = path.join(ROOT, 'scripts', 'generate-feature.js');

function goFrameworkFixture(framework) {
  const requireLine = framework === 'gin'
    ? 'require github.com/gin-gonic/gin v1.10.0'
    : framework === 'chi'
      ? 'require github.com/go-chi/chi/v5 v5.0.12'
      : 'require github.com/gofiber/fiber/v2 v2.52.0';
  const routesFile = framework === 'gin'
    ? 'package handlers\n\nimport "github.com/gin-gonic/gin"\n\nfunc RegisterRoutes(router gin.IRouter) {}\n'
    : framework === 'chi'
      ? 'package handlers\n\nimport "github.com/go-chi/chi/v5"\n\nfunc RegisterRoutes(router chi.Router) {}\n'
      : 'package handlers\n\nimport "github.com/gofiber/fiber/v2"\n\nfunc RegisterRoutes(app fiber.Router) {}\n';
  return {
    'go.mod': ['module example.com/demo', '', 'go 1.22', '', requireLine, ''].join('\n'),
    'internal/handlers/routes.go': routesFile,
    'internal/services/health_service.go': 'package services\n\ntype HealthService struct{}\n',
    'internal/models/health_model.go': 'package models\n\ntype HealthRecord struct {\n\tStatus string `json:"status"`\n}\n',
    'docs/api/index.md': '# API\n',
  };
}

test('analyze-project-structure keeps detected Go web framework', () => {
  for (const framework of ['gin', 'chi', 'fiber']) {
    withTempDir((dir) => { writeFiles(dir, goFrameworkFixture(framework)); }, (dir) => {
      const result = runNodeJson(ANALYZE, ['--root', dir, '--json'], { cwd: ROOT });
      assert.equal(result.runtime, 'go');
      assert.equal(result.framework, framework);
      assert.equal(result.architecture_pattern, 'go-internal-packages');
    });
  }
});

test('generate-feature emits framework-specific Go route and controller code in dry-run mode', () => {
  const expectations = {
    gin: ['func RegisterAuditLogRoutes(router gin.IRouter)', 'group := router.Group("/audit-log")', 'group.POST("", handler.Create)', 'func (handler *AuditLogHandler) Create(ctx *gin.Context)'],
    chi: ['func RegisterAuditLogRoutes(router chi.Router)', 'router.Route("/audit-log", func(r chi.Router)', 'r.Post("/", handler.Create)', 'func (handler *AuditLogHandler) Create(w http.ResponseWriter, r *http.Request)'],
    fiber: ['func RegisterAuditLogRoutes(app fiber.Router)', 'group := app.Group("/audit-log", AuditLogMiddleware()', 'group.Post("/", handler.Create)', 'func (handler *AuditLogHandler) Create(ctx *fiber.Ctx) error'],
  };

  for (const framework of ['gin', 'chi', 'fiber']) {
    withTempDir((dir) => { writeFiles(dir, goFrameworkFixture(framework)); }, (dir) => {
      const result = runNodeJson(GENERATE_FEATURE, ['audit-log', '--root', dir, '--dry-run', '--with-test', 'true', '--json'], { cwd: ROOT });
      assert.equal(result.skill, 'generate-go-feature');
      assert.equal(result.project_structure.framework, framework);
      const routePreview = result.preview.find((item) => item.output === 'internal/handlers/audit_log_routes.go');
      const controllerPreview = result.preview.find((item) => item.output === 'internal/handlers/audit_log_handler.go');
      const testPreview = result.preview.find((item) => item.output === 'internal/handlers/audit_log_test.go');
      assert.ok(routePreview);
      assert.ok(controllerPreview);
      assert.ok(testPreview);
      for (const expected of expectations[framework]) {
        assert.ok(routePreview.body.includes(expected) || controllerPreview.body.includes(expected), `${framework} output should include ${expected}`);
      }
      if (framework === 'fiber') {
        assert.ok(testPreview.body.includes('app := fiber.New()'));
        assert.ok(testPreview.body.includes('response, err := app.Test(request)'));
      }
      if (framework === 'gin') {
        assert.ok(testPreview.body.includes('gin.SetMode(gin.TestMode)'));
        assert.ok(testPreview.body.includes('router := gin.New()'));
      }
      if (framework === 'chi') {
        assert.ok(testPreview.body.includes('router := chi.NewRouter()'));
        assert.ok(testPreview.body.includes('router.ServeHTTP(recorder, request)'));
      }
    });
  }
});
