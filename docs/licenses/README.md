# Third-party notices

OnPurpose is licensed under the GNU General Public License, version 3 or later
(see [LICENSE](../../LICENSE)). This folder keeps the licence notices for
third-party material that is copied into this repository, or that the
documentation calls out because it is central to a feature.

| File                                                   | Covers                                                                                                                  |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| [EXPO_TEMPLATE_LICENSE.txt](EXPO_TEMPLATE_LICENSE.txt) | Starting files generated from the Expo app template (MIT)                                                               |
| [PHOSPHOR_LICENSE.txt](PHOSPHOR_LICENSE.txt)           | Phosphor icon path data generated into `src/phosphorPaths.ts` and `src/habitIconCatalog.ts` (MIT)                       |
| [TABLER_LICENSE.txt](TABLER_LICENSE.txt)               | Tabler icon path data generated into `src/tablerPaths.ts`, `src/tablerIconCatalog.ts` and `src/editorIconPaths.ts` (MIT) |
| [TIPTAP_LICENSE.txt](TIPTAP_LICENSE.txt)               | Tiptap packages used by the description editor (MIT)                                                                    |
| [PROSEMIRROR_LICENSES.txt](PROSEMIRROR_LICENSES.txt)   | ProseMirror packages beneath Tiptap (MIT)                                                                               |
| [MARKED_LICENSE.txt](MARKED_LICENSE.txt)               | `marked`, which `@tiptap/markdown` uses to parse Markdown (MIT, with the original Markdown licence)                     |
| [MARKDOWN_IT_LICENSE.txt](MARKDOWN_IT_LICENSE.txt)     | `markdown-it`, the Markdown parser behind the native description readers (MIT)                                          |

All other dependencies are installed from npm and keep their licence files in
`node_modules`; none of their code is committed here.

## Distributed builds

An app build bundles far more than the packages above. For example, the
`markdown-it/browser` build inlines `entities` (BSD-2-Clause), `mdurl`,
`linkify-it`, `punycode.js` and `uc.micro`, and every React Native and Expo
package carries its own notice. Before distributing a build, generate a complete
notices file (or in-app acknowledgements) from the production dependency tree.
This is a release step in [RELEASING.md](../RELEASING.md).
