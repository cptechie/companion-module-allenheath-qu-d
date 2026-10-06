## Allen & Heath Qu-5 / Qu-6 / Qu-7 (Qu-5D / Qu-6D / Qu-7D)

Controls the new Qu series using the Allen & Heath **Qu-5/6/7 MIDI Protocol** (firmware V1.1 or later) over the network.

### Setup

1. Connect the mixer's **NETWORK** port to the same network as Companion. On the D models you can also use the Dante port with **Control Network Bridge** turned on in **SETUP > Network**.
2. On the mixer, open **UTILITY > General > MIDI** and note the **MIDI Channel** and the **NRPN Fader Law**.
3. In Companion, enter the mixer's IP address. The port is `51325` and should not need changing.
4. Set **Mixer MIDI channel** and **NRPN Fader Law** to the same values as the mixer. If the fader law does not match, levels will be wrong.

The MIDI strips (DAW control) always use the mixer MIDI channel + 1. Set the mixer to channel 16 to use channel 1 for the strips.

### Actions

| Action                                                  | What it does                                                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Mute                                                    | Mute, unmute or toggle inputs 1-32, ST1, ST2, USB, FX returns, LR, mixes 1-12, FX sends, matrices, DCAs and mute groups   |
| Master fader level                                      | Set a level in dB, or step it up/down 1 dB, for LR, mixes, FX sends, matrices and DCAs                                    |
| Send level                                              | Level from an input, group or FX return to LR, a mix or an FX send. Set in dB or step 1 dB                                |
| Matrix send level                                       | Level from LR or a mix to a matrix                                                                                        |
| Pan / balance                                           | Pan or balance of an input, group or FX return in LR or a stereo mix. Set a position or step left/right                   |
| Matrix balance                                          | Balance of LR or a mix in the Matrix 1&2 or 3&4 pair                                                                      |
| Mix assignment                                          | Assign an input, group or FX return to LR, a mix or an FX send. FX returns can also be assigned to groups                 |
| Matrix assignment                                       | Assign LR or a mix to a matrix                                                                                            |
| Recall scene                                            | Recall scenes 1-300. Blank scenes can't be recalled                                                                       |
| Soft key                                                | Press, hold or release soft keys 1-16. Keys 9-16 are set up in Qu-MixPad                                                  |
| MIDI Show Control                                       | GO, STOP, RESUME, LOAD, STANDBY +/- (next/previous) and more for the Cue List. The Scene Manager must be in Cue List mode |
| MIDI strip: fader / key                                 | Drive the 32 MIDI fader strips (fader CC and Mute/Sel/PAFL notes)                                                         |
| MIDI: send note / program change / CC / MMC / raw bytes | Send any other MIDI message to the mixer                                                                                  |
| Refresh mixer state                                     | Read all values used by feedbacks and variables again                                                                     |

Levels can be learned from the mixer with the **Learn** button on the level and pan actions. A value of `-90` dB means `-inf`.

Stereo channels and stereo mixes use the left / odd channel. For example, to pan into the Mix 1&2 stereo pair, select Mix 1.

Matrix 3 and Matrix 4 share one send parameter in the protocol, so they appear together as **Matrix 3/4** for sends and assignments.

### Feedbacks

- Mute state, mix assignment and matrix assignment
- Master, send and matrix send levels compared with a dB value
- Pan / balance position compared with a value
- Value feedbacks for levels and pan positions, to use in local variables and expressions
- Current scene
- MIDI strip key states and fader values sent by the mixer
- MIDI note held and program change received (useful for soft keys and footswitches assigned to MIDI on the mixer)
- Connection status

Feedbacks ask the mixer for any value they need, so they work for every channel without extra setup.

### Variables

| Variable                                                           | Description                                                              |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `mute_<channel>`                                                   | Mute state, eg `mute_ip1`, `mute_lr`, `mute_dca3`, `mute_mgrp2`          |
| `level_<channel>`                                                  | Master level in dB, eg `level_lr`, `level_mix4`, `level_dca1`            |
| `send_<source>_lr`                                                 | Level of a source in LR, eg `send_ip5_lr`, `send_st1_lr`, `send_fxr2_lr` |
| `pan_<source>_lr`                                                  | Pan of a source in LR, eg `L30`, `C`, `R15`                              |
| `assign_<source>_lr`                                               | Whether a source is assigned to LR                                       |
| `scene`                                                            | Last recalled scene                                                      |
| `strip<n>_fader`, `strip<n>_mute`, `strip<n>_sel`, `strip<n>_pafl` | MIDI strip states sent by the mixer                                      |
| `last_note`, `last_note_channel`, `last_note_velocity`             | Last MIDI note received                                                  |
| `last_program`, `last_program_channel`                             | Last program change received                                             |
| `last_cc`, `last_cc_channel`, `last_cc_value`                      | Last CC received (NRPN messages excluded)                                |
| `last_mmc`                                                         | Last MIDI Machine Control command received                               |

Channel ids: `ip1`-`ip32`, `st1`, `st2`, `usb`, `grp1`-`grp12`, `fxr1`-`fxr6`, `lr`, `mix1`-`mix12`, `fxs1`-`fxs4`, `mtx1`-`mtx4`, `dca1`-`dca8`, `mgrp1`-`mgrp8`.

### Action recording

While Companion's action recorder is running, changes made on the mixer (mutes, levels, pans, assignments and scene recalls) are recorded as actions.

### Notes

- Only network MIDI is supported. USB MIDI isn't available to Companion modules.
- If a value is changed on the mixer while Companion is not connected, it is read again when the connection returns.
