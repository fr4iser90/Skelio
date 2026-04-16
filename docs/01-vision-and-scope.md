# 01 — Vision and scope

## Vision

Give indie teams and open-source contributors a **clear, versioned runtime format** and a **native-feeling editor** for 2D (and light 2.5D) skeletal animation, with **Godot** as a first-class consumption path.

## In scope (directional)

- Authoring bones, simple IK chains, clips, and keys.
- Exporting runtime JSON validated against the published JSON Schema.
- Skinning workflows sufficient for MVP demos (meshes, influences, weight painting where implemented).
- Transparent documentation of limitations (see [15-product-gaps-and-roadmap.md](./15-product-gaps-and-roadmap.md)).

## Out of scope (for now)

- Importing third-party proprietary project formats as a primary goal.
- Full 3D film pipelines; 3D here means camera/pose aids for 2D-style rigs, not a general 3D DCC.

## Success criteria (product)

End users can complete a **small vertical slice**: rig a simple character, animate a short clip, export, and play it in a documented Godot path without hand-editing JSON.
