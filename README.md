# companion-module-allenheath-qu-d

Bitfocus Companion module for the Allen & Heath Qu-5, Qu-6 and Qu-7 mixers (including the Qu-5D, Qu-6D and Qu-7D), using the Qu-5/6/7 MIDI Protocol over TCP/IP.

See [HELP.md](./companion/HELP.md) for the user guide and [LICENSE](./LICENSE).

Built against `@companion-module/base` 2.1, which works with Companion 5.0 and later.

## Development

Executing a `yarn` command should perform all necessary steps to develop the module.

- `yarn build` compiles the module once. This is enough for Companion to load it from a developer modules folder.
- `yarn dev` compiles in watch mode.
- `yarn test` runs the protocol unit tests.
- `yarn lint` checks formatting and lint rules.
- `yarn package` builds the `.tgz` package that can be imported in Companion under **Modules > Import module package**.

## Protocol coverage

| Protocol section                                                         | Supported                                             |
| ------------------------------------------------------------------------ | ----------------------------------------------------- |
| MIDI strips 1-32 (fader CC, Mute/Sel/PAFL notes)                         | Send and receive                                      |
| Soft keys 1-16                                                           | Press, hold and release                               |
| Soft key / footswitch MIDI notes, program changes and MMC from the mixer | Received as variables and feedbacks                   |
| Scene change (bank + program, scenes 1-300)                              | Send and receive                                      |
| MIDI Show Control                                                        | All common commands with cue, list and path           |
| Mutes                                                                    | On, off, toggle, get                                  |
| Levels                                                                   | Absolute (audio and linear taper), relative 1 dB, get |
| Panning / balance                                                        | Absolute, relative, get                               |
| Mix assignments                                                          | On, off, toggle, get                                  |

Parameter numbers are calculated from the layout of the protocol reference tables. The unit tests check them against the example messages in the protocol document.
