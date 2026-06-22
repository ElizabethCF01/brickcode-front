# Vendored third-party scripts

## packLDrawModel.mjs

Adapted from [three.js](https://github.com/mrdoob/three.js/blob/master/utils/packLDrawModel.mjs).

License: MIT (three.js authors). Original copyright preserved upstream.

This script is **not** distributed via npm — it lives only in the three.js
GitHub repo. Vendored here so `pnpm run pack-ldraw` works without a separate
checkout.

### Adaptation

Upstream is a CLI (reads `process.argv`, writes `<name>_Packed.mpd` next to
the input). We exposed a single named export `packLDrawModel(ldrawPath, fileName)`
that returns the packed string. The packing algorithm itself is unchanged.

If upstream changes meaningfully, refresh this file and re-apply the entry-
point wrapper.
