/**
 * The plugin's stable key, in its own module.
 *
 * The UI bundle needs this to build URLs into its own static asset directory
 * (`/_plugins/<id>/ui/...`) and to read its own row from the host's plugin
 * config API. Importing it from `./manifest` would drag the whole manifest
 * object literal into the UI bundle for one string, so the constant lives
 * here and the manifest imports it.
 */
export const PLUGIN_ID = "nickallevato.plugin-plica";
