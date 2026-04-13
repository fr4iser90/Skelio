# SPDX-License-Identifier: GPL-3.0-or-later
## Lädt Skelio-Runtime-JSON, wertet die erste Animation aus, zeichnet skinned Meshes (LBS) und Knochen-Ursprünge (y-down).
## Siehe docs/08-godot-integration.md und docs/adr/0005-godot-referenz-runtime-gdscript.md.
class_name SkelioPlayer
extends Node2D

@export_file("*.json") var runtime_json_path: String = "res://fixtures/runtime-minimal.valid.json"
@export var status_label_path: NodePath = ^"../Label"
@export var bone_dot_radius: float = 10.0
@export var bone_dot_color: Color = Color(0.35, 0.75, 0.45, 0.95)
@export var skin_fill_color: Color = Color(0.42, 0.58, 0.95, 0.38)
@export var skin_outline_color: Color = Color(0.55, 0.68, 1.0, 0.75)

var _data: Dictionary = {}
var _bones: Array = []
var _bone_index: Dictionary = {} # id -> int
var _anim: Dictionary = {}
var _loop_length: float = 1.0
var _time: float = 0.0
var _origins: Dictionary = {} # String -> Vector2
var _skins: Array = []
var _skin_deformed: Array = [] # per skin: Array of Vector2
var _status_label: Label


func _ready() -> void:
	_status_label = get_node_or_null(status_label_path) as Label
	_reload()


func _reload() -> void:
	_data.clear()
	_bones.clear()
	_bone_index.clear()
	_anim.clear()
	_origins.clear()
	_skins.clear()
	_skin_deformed.clear()
	if runtime_json_path.is_empty():
		push_warning("SkelioPlayer: runtime_json_path is empty")
		return
	if not FileAccess.file_exists(runtime_json_path):
		push_error("SkelioPlayer: file not found: %s" % runtime_json_path)
		return
	var text := FileAccess.get_file_as_string(runtime_json_path)
	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("SkelioPlayer: root must be a JSON object")
		return
	_data = parsed
	var coord: String = str(_data.get("meta", {}).get("coordinateSystem", ""))
	if coord != "y-down":
		push_warning("SkelioPlayer: expected meta.coordinateSystem y-down, got %s" % coord)
	_bones = _data.get("armature", {}).get("bones", [])
	for i in _bones.size():
		var b: Dictionary = _bones[i]
		_bone_index[str(b.get("id", ""))] = i
	_skins = _data.get("skins", [])
	for _i in range(_skins.size()):
		_skin_deformed.append([])
	var anims: Array = _data.get("animations", [])
	if anims.size() > 0:
		_anim = anims[0]
		_loop_length = maxf(
			maxf(float(_anim.get("length", 0.0)), float(_data.get("meta", {}).get("duration", 0.0))),
			1.0 / 60.0,
		)
	else:
		_anim = {}
		_loop_length = maxf(float(_data.get("meta", {}).get("duration", 0.0)), 1.0 / 60.0)
	_time = 0.0
	_sample_at(_time)


func _process(delta: float) -> void:
	if _bones.is_empty():
		return
	_time = fposmod(_time + delta, _loop_length)
	_sample_at(_time)
	queue_redraw()
	if _status_label:
		var root_id := _root_bone_id()
		var p: Vector2 = _origins.get(root_id, Vector2.ZERO) as Vector2
		_status_label.text = "Skelio runtime — root @ (%.1f, %.1f)  t=%.2fs / %.2fs  skins=%d" % [
			p.x,
			p.y,
			_time,
			_loop_length,
			_skins.size(),
		]


func _draw() -> void:
	for si in range(_skins.size()):
		var skin: Dictionary = _skins[si]
		var idx: Array = skin.get("indices", [])
		var pts: Array = _skin_deformed[si] if si < _skin_deformed.size() else []
		var tri_color := skin_fill_color
		var outline_w := 1.5
		for t0 in range(0, idx.size(), 3):
			if t0 + 2 >= idx.size():
				break
			var ia := int(idx[t0])
			var ib := int(idx[t0 + 1])
			var ic := int(idx[t0 + 2])
			if ia < 0 or ia >= pts.size() or ib < 0 or ib >= pts.size() or ic < 0 or ic >= pts.size():
				continue
			var a: Vector2 = pts[ia]
			var b: Vector2 = pts[ib]
			var c: Vector2 = pts[ic]
			var poly := PackedVector2Array([a, b, c])
			var cols := PackedColorArray([tri_color, tri_color, tri_color])
			draw_polygon(poly, cols)
			draw_polyline(poly + PackedVector2Array([a]), skin_outline_color, outline_w, true)

	for bone_id in _origins.keys():
		var p: Vector2 = _origins[bone_id] as Vector2
		draw_circle(p, bone_dot_radius, bone_dot_color)
		draw_arc(p, bone_dot_radius + 2.0, 0.0, TAU, 32, Color(0.1, 0.1, 0.12, 0.6), 2.0, true)


func _root_bone_id() -> String:
	for b in _bones:
		var d: Dictionary = b
		if d.get("parentId") == null:
			return str(d.get("id", ""))
	return str((_bones[0] as Dictionary).get("id", ""))


func _sample_at(t: float) -> void:
	_origins.clear()
	if _bones.is_empty():
		return
	var world_pose: Dictionary = {} # id -> PackedFloat32Array [a,b,c,d,e,f]
	var roots: Array[String] = []
	for b in _bones:
		var bd: Dictionary = b
		if bd.get("parentId") == null:
			roots.append(str(bd.get("id", "")))
	for root_id in roots:
		_visit_bone(root_id, null, world_pose, t)
	for id in world_pose.keys():
		var m: PackedFloat32Array = world_pose[id] as PackedFloat32Array
		_origins[id] = _apply_mat(m, 0.0, 0.0)
	_build_skin_deformations(t)


func _build_skin_deformations(t: float) -> void:
	var bind_w := _accumulate_world_matrices(t, true)
	var pose_w := _accumulate_world_matrices(t, false)
	for si in range(_skins.size()):
		var skin: Dictionary = _skins[si]
		var verts: Array = skin.get("vertices", [])
		var infl: Array = skin.get("influences", [])
		var out: Array = []
		out.resize(verts.size())
		for vi in range(verts.size()):
			var vd: Dictionary = verts[vi]
			var v := Vector2(float(vd.get("x", 0.0)), float(vd.get("y", 0.0)))
			var row: Array = infl[vi] if vi < infl.size() else []
			out[vi] = _deform_vertex(v, row, bind_w, pose_w)
		_skin_deformed[si] = out


func _deform_vertex(
	v: Vector2,
	influences: Array,
	bind_w: Dictionary,
	pose_w: Dictionary,
) -> Vector2:
	var ox := 0.0
	var oy := 0.0
	var wsum := 0.0
	for inf in influences:
		var infd: Dictionary = inf
		var bid := str(infd.get("boneId", ""))
		var wt := float(infd.get("weight", 0.0))
		if wt <= 0.0:
			continue
		var bw: Variant = bind_w.get(bid, null)
		var pw: Variant = pose_w.get(bid, null)
		if bw == null or pw == null:
			continue
		var invb: Variant = _invert_mat(bw as PackedFloat32Array)
		if invb == null:
			continue
		var sm := _multiply_mat(pw as PackedFloat32Array, invb as PackedFloat32Array)
		var p := _apply_mat(sm, v.x, v.y)
		ox += wt * p.x
		oy += wt * p.y
		wsum += wt
	if wsum > 1e-9:
		return Vector2(ox / wsum, oy / wsum)
	return v


func _accumulate_world_matrices(_t: float, bind_only: bool) -> Dictionary:
	var world: Dictionary = {}
	var roots: Array[String] = []
	for b in _bones:
		var bd: Dictionary = b
		if bd.get("parentId") == null:
			roots.append(str(bd.get("id", "")))
	for root_id in roots:
		_visit_bone_matrix(root_id, null, world, _t, bind_only)
	return world


func _visit_bone_matrix(id: String, parent_world: Variant, world: Dictionary, t: float, bind_only: bool) -> void:
	var bone: Dictionary = _bones[_bone_index[id]] as Dictionary
	var local: PackedFloat32Array
	if bind_only:
		local = _from_transform(_bind_pose_only(bone))
	else:
		local = _from_transform(_local_transform_at_time(bone, t))
	var w := local if parent_world == null else _multiply_mat(parent_world as PackedFloat32Array, local)
	world[id] = w
	for c in _bones:
		var cd: Dictionary = c
		if cd.get("parentId") != null and str(cd.get("parentId")) == id:
			_visit_bone_matrix(str(cd.get("id", "")), w, world, t, bind_only)


func _bind_pose_only(bone: Dictionary) -> Dictionary:
	var bp: Dictionary = bone.get("bindPose", {})
	return {
		"x": float(bp.get("x", 0.0)),
		"y": float(bp.get("y", 0.0)),
		"rotation": float(bp.get("rotation", 0.0)),
		"sx": float(bp.get("sx", 1.0)),
		"sy": float(bp.get("sy", 1.0)),
	}


func _visit_bone(id: String, parent_world: Variant, world: Dictionary, t: float) -> void:
	var bone: Dictionary = _bones[_bone_index[id]] as Dictionary
	var local := _from_transform(_local_transform_at_time(bone, t))
	var w := local if parent_world == null else _multiply_mat(parent_world as PackedFloat32Array, local)
	world[id] = w
	for c in _bones:
		var cd: Dictionary = c
		var pid = cd.get("parentId")
		if pid != null and str(pid) == id:
			_visit_bone(str(cd.get("id", "")), w, world, t)


func _local_transform_at_time(bone: Dictionary, t: float) -> Dictionary:
	var bp: Dictionary = bone.get("bindPose", {})
	var x := float(bp.get("x", 0.0))
	var y := float(bp.get("y", 0.0))
	var rot := float(bp.get("rotation", 0.0))
	var sx := float(bp.get("sx", 1.0))
	var sy := float(bp.get("sy", 1.0))
	if _anim.is_empty():
		return {"x": x, "y": y, "rotation": rot, "sx": sx, "sy": sy}
	var tracks: Array = _anim.get("tracks", [])
	var bone_id := str(bone.get("id", ""))
	for tr in tracks:
		var trd: Dictionary = tr
		if str(trd.get("boneId", "")) != bone_id:
			continue
		for ch in trd.get("channels", []):
			var chd: Dictionary = ch
			var prop: String = str(chd.get("property", ""))
			var keys: Array = chd.get("keys", [])
			match prop:
				"tx":
					x = _sample_keys_linear(keys, t, x)
				"ty":
					y = _sample_keys_linear(keys, t, y)
				"rot":
					rot = _sample_keys_linear(keys, t, rot)
				"sx":
					sx = _sample_keys_linear(keys, t, sx)
				"sy":
					sy = _sample_keys_linear(keys, t, sy)
		break
	return {"x": x, "y": y, "rotation": rot, "sx": sx, "sy": sy}


func _sample_keys_linear(keys: Array, t: float, fallback: float) -> float:
	if keys.is_empty():
		return fallback
	var sorted: Array = keys.duplicate()
	sorted.sort_custom(func(a, b): return float((a as Dictionary).get("t", 0.0)) < float((b as Dictionary).get("t", 0.0)))
	var first: Dictionary = sorted[0]
	var last: Dictionary = sorted[sorted.size() - 1]
	var t0 := float(first.get("t", 0.0))
	var t1 := float(last.get("t", 0.0))
	if t <= t0:
		return float(first.get("v", fallback))
	if t >= t1:
		return float(last.get("v", fallback))
	for i in range(sorted.size() - 1):
		var ka: Dictionary = sorted[i]
		var kb: Dictionary = sorted[i + 1]
		var ta := float(ka.get("t", 0.0))
		var tb := float(kb.get("t", 0.0))
		if t >= ta and t <= tb:
			var va := float(ka.get("v", 0.0))
			var vb := float(kb.get("v", 0.0))
			var u := (t - ta) / (tb - ta) if abs(tb - ta) > 1e-9 else 0.0
			return lerpf(va, vb, u)
	return fallback


func _from_transform(tr: Dictionary) -> PackedFloat32Array:
	var c := cos(float(tr.get("rotation", 0.0)))
	var s := sin(float(tr.get("rotation", 0.0)))
	var sx := float(tr.get("sx", 1.0))
	var sy := float(tr.get("sy", 1.0))
	var x := float(tr.get("x", 0.0))
	var y := float(tr.get("y", 0.0))
	return PackedFloat32Array([c * sx, s * sx, -s * sy, c * sy, x, y])


func _invert_mat(m: PackedFloat32Array) -> Variant:
	var a := m[0]
	var b := m[1]
	var c := m[2]
	var d := m[3]
	var e := m[4]
	var f := m[5]
	var det := a * d - b * c
	if abs(det) < 1e-14:
		return null
	var inv_det := 1.0 / det
	var ia := d * inv_det
	var ib := -b * inv_det
	var ic := -c * inv_det
	var id := a * inv_det
	var ie := -(ia * e + ic * f)
	var if_ := -(ib * e + id * f)
	return PackedFloat32Array([ia, ib, ic, id, ie, if_])


func _multiply_mat(m: PackedFloat32Array, n: PackedFloat32Array) -> PackedFloat32Array:
	return PackedFloat32Array([
		m[0] * n[0] + m[2] * n[1],
		m[1] * n[0] + m[3] * n[1],
		m[0] * n[2] + m[2] * n[3],
		m[1] * n[2] + m[3] * n[3],
		m[0] * n[4] + m[2] * n[5] + m[4],
		m[1] * n[4] + m[3] * n[5] + m[5],
	])


func _apply_mat(m: PackedFloat32Array, px: float, py: float) -> Vector2:
	return Vector2(m[0] * px + m[2] * py + m[4], m[1] * px + m[3] * py + m[5])
