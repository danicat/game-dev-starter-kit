# Lyria 3 References & Model Cards

This directory contains technical model cards, capability specifications, arrangement guides, and integration details for Google's **Lyria 3** music generation models.

## Model Cards & Technical References

- **[Lyria 3.5 (`lyria-3.5`)](lyria-3-5.md)**: Flagship music generation model for full-length songs, multi-section arrangements, expressive vocals, and multimodal composition.
- **[Lyria 3 Clip (`lyria-3-clip-preview`)](lyria-3-clip.md)**: 30-second music clips, short loops, social audio, and rapid style prototyping.
- **[Lyria 3 Pro (`lyria-3-pro-preview`)](lyria-3-pro.md)**: Legacy full-length preview model (up to 184 seconds) with multi-section structures and timestamp controls.

---

## Composition Quick Reference

When prompting Lyria models, combine these structural building blocks:

1. **Genre & Style**: Define the core musical style (e.g. `lo-fi hip-hop`, `synthwave`, `chamber orchestra`, `delta blues`).
2. **Instrumentation**: Specify lead and rhythm instruments (e.g. `Rhodes piano`, `808 bass`, `acoustic nylon guitar`, `cello section`).
3. **Tempo & Key**: Set musical parameters (e.g. `120 BPM`, `in D minor`, `slow waltz tempo`).
4. **Vocals vs Instrumental**: Add `"Instrumental only, no vocals"` for instrumental beds, or provide bracketed section lyrics (`[Verse 1]`, `[Chorus]`).
5. **Timestamps (Lyria 3.5 / Pro)**: Use time ranges (`[0:00 - 0:15] Intro...`) to coordinate dynamics.
