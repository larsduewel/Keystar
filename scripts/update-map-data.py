"""Rebuild the bundled map from CCP's official SDE. Python standard library only."""
import io, json, pathlib, urllib.request, zipfile
url = "https://developers.eveonline.com/static-data/eve-online-static-data-latest-jsonl.zip"
with urllib.request.urlopen(url) as response:
    archive = zipfile.ZipFile(io.BytesIO(response.read()))
rows = []
for line in archive.open("mapSolarSystems.jsonl"):
    record = json.loads(line)
    position = record.get("position")
    name = record.get("name", {}).get("en")
    if position and name:
        rows.append([record["_key"], name, record["securityStatus"],
                     *[position[axis] / 9.4607304725808e15 for axis in ("x", "y", "z")]])
rows.sort(key=lambda row: row[1].lower())
target = pathlib.Path(__file__).resolve().parents[1] / "public/data/map-systems.json"
target.write_text(json.dumps(rows, separators=(",", ":")), encoding="utf8")
print(f"Wrote {len(rows)} systems to {target}")

gates = []
for line in archive.open("mapStargates.jsonl"):
    record = json.loads(line)
    pos, dest = record["position"], record["destination"]
    gates.append([record["_key"], record["solarSystemID"], dest["solarSystemID"],
                  dest["stargateID"], pos["x"], pos["y"], pos["z"]])
(target.parent / "map-gates.json").write_text(json.dumps(gates, separators=(",", ":")), encoding="utf8")
dogma = {r["_key"]: r for line in archive.open("typeDogma.jsonl") for r in [json.loads(line)]}
# Resolve the command-carrier representative from its SDE group rather than a fixed hull ID.
groups = {r["_key"]: r.get("name", {}).get("en", "") for line in archive.open("groups.jsonl") for r in [json.loads(line)]}
command_ids = [r["_key"] for line in archive.open("types.jsonl") for r in [json.loads(line)]
               if groups.get(r.get("groupID"), "").lower() in ("command carrier", "command carriers") and r["_key"] in dogma
               and any(a["attributeID"] == 867 for a in dogma[r["_key"]]["dogmaAttributes"])]
if not command_ids:
    raise ValueError("No command carrier jump-drive hull found in the SDE")
bases = {name: next(a["value"] for a in dogma[type_id]["dogmaAttributes"] if a["attributeID"] == 867)
         for name, type_id in [("carrier", 23911), ("freighter", 28844), ("blackops", 22436), ("supercapital", 23913), ("commandCarrier", min(command_ids))]}
bonus = next(a["value"] / 100 for a in dogma[21611]["dogmaAttributes"] if a["attributeID"] == 870)
restricted = [r["_key"] for line in archive.open("mapSolarSystems.jsonl") for r in [json.loads(line)]
              if r.get("regionID") == 10000070 or r.get("name", {}).get("en") == "Zarzakh"]
(target.parent / "map-jump-rules.json").write_text(
    json.dumps({"bases": bases, "calibrationBonus": bonus, "restricted": restricted}, separators=(",", ":")), encoding="utf8")
print(f"Wrote {len(gates)} gates and jump-drive rules")
