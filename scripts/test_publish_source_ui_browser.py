"""Opt-in integration: OFFLINE research/approvals and a SYNTHETIC review fixture; real Design CLI and ZIP.

Luz-Design builds a runnable frontend with frontend.py (init, seal, review) and checks and exports the complete package with
ui_package.py. This test drives those real commands and publishes the result from a Luz System session. The review that
frontend.py binds must come from a person who looked at the pages; here it is a labelled fixture, so the test proves the
orchestration and the byte bindings only. It does not establish live business research, a visual or browser acceptance,
customer approval, native mini-program behaviour, backend capabilities, or production acceptance.
"""
import hashlib
import json
import os
import subprocess
import sys
import zipfile
from pathlib import Path

import pytest

import publish
import validate_session
from test_publish_source_ui import selected
from test_session_flow import ROOT, adopt_rules, prepare_prototype

DESIGN_ROOT = ROOT.parent / "Luz-Design"
FIXTURE_NOTE = "Synthetic integration fixture; not product acceptance."


def review_fixture(design: Path, package: Path) -> Path:
    """The review input frontend.py asks for, with labelled fixture evidence inside the Design session's raw folder."""
    from PIL import Image
    sys.path.append(str(DESIGN_ROOT / "scripts"))
    import frontend
    raw = design / "raw"
    image, log, browser, quality = raw / "fixture.png", raw / "fixture.txt", raw / "browser-fixture.json", raw / "quality-fixture.json"
    Image.new("RGB", (240, 300), "white").save(image)
    log.write_text(FIXTURE_NOTE, encoding="utf-8")
    receipt = frontend.read(package / frontend.RECEIPT)
    frontend.write(browser, {"bundle_sha256": receipt["bundle_sha256"], "observations": [FIXTURE_NOTE], "limitations": [FIXTURE_NOTE]})
    rules = frontend.quality_module()
    assessment = rules.plan(rules.read(rules.CATALOG), rules.digest(rules.CATALOG), "luz-design", "design")
    assessment.update(receipt_sha256=frontend.digest(package / frontend.RECEIPT), browser_report_sha256=frontend.digest(browser))
    for row in assessment["rows"]:
        row.update(status="not-applicable", reason=FIXTURE_NOTE, reviewer="integration-fixture")
    frontend.write(quality, assessment)
    evidence = {"path": str(log), "sha256": frontend.digest(log)}
    assets = sorted(item.relative_to(package).as_posix() for item in (package / "artwork").glob("*.webp"))
    review = raw / "review-input.json"
    frontend.write(review, {
        "bundle_sha256": receipt["bundle_sha256"], "reviewer": "integration-fixture",
        "browser_report": {"path": str(browser), "sha256": frontend.digest(browser)},
        "quality_assessment": {"path": str(quality), "sha256": frontend.digest(quality)},
        "blocking_findings": [], "component_usage": ["fixture"], "limitations": [FIXTURE_NOTE],
        "hard_rules": {"sha256": frontend.digest(frontend.HARD_RULES), "violations": [], "reviewed": sorted(frontend.REVIEW_RULES)},
        "loaded_assets": assets,
        "experience_axes": {axis: {"status": "verified", "observed": FIXTURE_NOTE, "limitations": [FIXTURE_NOTE], "evidence": [evidence]}
                            for axis in ("UX", "AX", "DX")},
        "observations": [{"viewport": "fixture", "finding": FIXTURE_NOTE, "screenshot": {"path": str(image), "sha256": frontend.digest(image)}}],
        "interactions": [{"action": "fixture", "result": FIXTURE_NOTE, "evidence": evidence}],
    })
    return review


@pytest.mark.skipif(os.environ.get("LUZ_RUN_SOURCE_UI_BROWSER_INTEGRATION") != "1",
                    reason="explicit opt-in: drives the real Luz-Design CLI (session, frontend package, check, export)")
def test_real_ui(tmp_path, monkeypatch):
    # Isolate the test from a caller's linked business project.
    for key in ("LUZ_PROJECT_ROOT", "LUZ_DESIGN_SESSION", "LUZ_CRAWL_STAGE"):
        monkeypatch.delenv(key, raising=False)
    system_root = tmp_path / "s"
    system_root.mkdir()
    session = prepare_prototype(system_root)
    monkeypatch.setattr(validate_session, "NOTES_FILE", system_root / "notes.json")
    adopt_rules(session)
    selected(session, "frontend-web-workspace")

    process = tmp_path / "process"
    process.mkdir()
    commands = []

    def real_cli(script, *arguments):
        argv = [sys.executable, "-X", "utf8", str(script), *map(str, arguments)]
        result = subprocess.run(argv, capture_output=True, text=True, encoding="utf-8", errors="replace")
        commands.append({"argv": argv, "exit_code": result.returncode})
        log = process / f"{len(commands):02d}-{Path(script).stem}.json"
        log.write_text(json.dumps({**commands[-1], "stdout": result.stdout, "stderr": result.stderr},
                                  ensure_ascii=False, indent=2), encoding="utf-8")
        assert result.returncode == 0, (result.stdout + result.stderr)[-5000:]
        return result.stdout

    created = real_cli(DESIGN_ROOT / "scripts/new_session.py", "--name", "OFFLINE-ui",
                       "--modes", "document", "--root", tmp_path / "d", "--card", "web")
    design = Path(created.strip().splitlines()[-1])
    # Canonical explicitly offline fixture, never a fabricated live Crawl run.
    sys.path.append(str(ROOT.parent / "Luz-Crawl/scripts"))
    from test_crawl_preflight import complete_fixture
    complete_fixture(design, "luz-design", "design")
    built = json.loads(real_cli(DESIGN_ROOT / "scripts/frontend.py", "init", "web-workspace", "--session", design, "--stage", "design"))
    package = Path(built["package"])
    real_cli(DESIGN_ROOT / "scripts/frontend.py", "review", package, "--session", design, "--file", review_fixture(design, package))
    proof = json.loads(real_cli(DESIGN_ROOT / "scripts/ui_package.py", "check", package, "--session", design))
    assert proof["mode"] == "frontend" and proof["template_id"] == "frontend-web-workspace"
    reference = {"session": str(design), "package": str(package), "entrypoint": built["entries"][0]}
    result = publish.publish(session, "prototype", source_reference=reference)
    assert validate_session.validate(session, allow_live_crawl_offline=True) == []
    manifest = json.loads((session / "raw/99-delivery/MANIFEST.json").read_text(encoding="utf-8"))
    publication = publish.verify_ui_publication(session, manifest, "prototype")
    assert publication["template_id"] == "frontend-web-workspace"
    archive = session / "prototype-source.zip"
    expected = {file.relative_to(package).as_posix(): file.read_bytes()
                for file in package.rglob("*") if file.is_file()}
    with zipfile.ZipFile(archive) as zipped:
        assert len(zipped.namelist()) == len(expected)
        assert {name: zipped.read(name) for name in zipped.namelist()} == expected
    assert 'href="prototype-source.zip"' in result.read_text(encoding="utf-8")
    (tmp_path / "integration-result.json").write_text(json.dumps({
        "scope": "OFFLINE research and approval fixtures and a synthetic review fixture; real Design CLI, package check and ZIP",
        "business_research": "not asserted", "customer_approval": "not asserted", "visual_review": "not asserted",
        "system_session": str(session), "design_session": str(design), "package": str(package),
        "archive_files": len(expected), "archive_sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
        "publication": publication, "commands": commands,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
