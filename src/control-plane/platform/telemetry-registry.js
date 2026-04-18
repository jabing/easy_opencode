const { buildTelemetrySummary, buildArtifactIndex, buildRunSummary, buildRunTimeline } = require('./api-models.js');

/**
 * @typedef {{
 *   id: string,
 *   title?: string,
 *   description?: string,
 *   export(payload: Record<string, unknown>, options?: Record<string, unknown>): unknown
 * }} TelemetryExporter
 */

/** @typedef {{ release?: { ui_card?: unknown }, runs?: unknown[], active_run?: { status?: string, run_id?: string } | null, telemetry?: { observability_event_count?: number } | null } & Record<string, unknown>} TelemetryPayload */

function createRegistry() {
  /** @type {Map<string, TelemetryExporter>} */
  const exporters = new Map();
  return {
    /** @param {TelemetryExporter} exporter */
    register(exporter) {
      if (!exporter || !exporter.id || typeof exporter.export !== 'function') throw new Error('invalid exporter');
      exporters.set(exporter.id, exporter);
      return exporter;
    },
    list() {
      return Array.from(exporters.values()).map((item) => ({ id: item.id, title: item.title || item.id, description: item.description || '' }));
    },
    /** @param {string} id @param {Record<string, unknown>} payload @param {Record<string, unknown>} [options] */
    run(id, payload, options = {}) {
      const exporter = exporters.get(id);
      if (!exporter) throw new Error(`unknown exporter: ${id}`);
      return exporter.export(payload, options);
    },
  };
}

function createDefaultTelemetryRegistry() {
  const registry = createRegistry();
  registry.register({
    id: 'platform-json',
    title: 'Platform JSON snapshot',
    description: 'Exports the full platform API payload as-is.',
    /** @param {Record<string, unknown>} payload */
    export(payload) {
      return payload;
    },
  });
  registry.register({
    id: 'ui-overview',
    title: 'UI overview cards',
    description: 'Exports condensed cards for a management dashboard.',
    /** @param {TelemetryPayload} payload */
    export(payload) {
      return {
        schema_name: 'platform_ui_overview',
        schema_version: '1.0',
        cards: [
          payload.release ? payload.release.ui_card : null,
          {
            title: 'Runs',
            subtitle: `total=${Array.isArray(payload.runs) ? payload.runs.length : 0}`,
            status: payload.active_run ? payload.active_run.status || 'idle' : 'idle',
            badges: [
              `active=${payload.active_run ? payload.active_run.run_id || 'none' : 'none'}`,
              `telemetry=${payload.telemetry ? payload.telemetry.observability_event_count || 0 : 0}`,
            ],
          },
        ].filter(Boolean),
      };
    },
  });
  return registry;
}

module.exports = {
  createRegistry,
  createDefaultTelemetryRegistry,
};
