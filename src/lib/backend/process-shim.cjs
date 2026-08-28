"use strict";

// Em Node, `process` já é global. Exportá-lo diretamente evita que o bundle
// do mysql2 importe a fachada ESM do builtin `process`, incompatível com o
// descritor de stdin disponibilizado pelo runtime isolado da Hostinger.
module.exports = globalThis.process;
