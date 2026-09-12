---
'@base-screen/plugin-core': minor
'@base-screen/plugin-manager': minor
'@base-screen/plugin-sdk': minor
---

Converge plugin registration with contribution declaration: plugin-sdk gains
createPluginRegistration, which pre-checks every custom element tag conflict before the
first define, registers plugin packages, host materials and panel/control elements in one
call, and returns the plugin-manager input directly; the manager's createCommandPort
option is now truly optional, and plugin-core exports isValidCustomElementName.
