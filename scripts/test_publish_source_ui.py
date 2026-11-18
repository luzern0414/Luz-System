"""System's handoff orchestration; CLI stubs here do not certify a browser audit."""
import json
import subprocess
import zipfile
from pathlib import Path

import pytest

import publish
import validate_session
from test_session_flow import ROOT, adopt_rules, prepare_prototype, select_design

REAL_SUBPROCESS_RUN = subprocess.run
# What Luz-Design's ui_package.py check reports for its two registered package types (component_ui.py and frontend.py).
COMPONENT_PROOF = {"mode": "component-reuse", "template_id": "ui-component-output", "entrypoints": ["index.html"]}
FRONTEND_PROOF = {"mode": "frontend", "template_id": "frontend-existing", "entry_files": {"0": "index.html"}}


@pytest.fixture(autouse=True)
def isolated_notes(monkeypatch):
    monkeypatch.setattr(validate_session, "NOTES_FILE", ROOT / "experience" / "notes.json")


def setup(tmp_path):
    root = tmp_path / "system"
    root.mkdir()
    session = prepare_prototype(root)
    adopt_rules(session)
    manifest = json.loads((session / "raw" / "99-delivery" / "MANIFEST.json").read_text(encoding="utf-8"))
    design = tmp_path / "design" / "001-source"
    package = design / "raw" / "package"
    (package / "assets").mkdir(parents=True)
    (package / "index.html").write_text('<link rel="stylesheet" href="assets/style.css"><script src="assets/app.js"></script>', encoding="utf-8")
    (package / "assets" / "style.css").write_text("/* offline fixture */", encoding="utf-8")
    (package / "assets" / "app.js").write_text("/* offline fixture */", encoding="utf-8")
    (package / "assets" / "icon.png").write_bytes(b"offline-image-fixture")
    # Minimum local context for the export-template selection. The CLI below
    # remains explicitly stubbed; this is no claim of a real Design audit.
    (design / "raw" / "99-delivery").mkdir()
    (design / "raw" / "00-rules").mkdir()
    (design / "raw" / "00-rules" / "fixture.md").write_text("offline fixture", encoding="utf-8")
    (design / "raw" / "BRIEF.md").write_text("offline fixture", encoding="utf-8")
    (design / "raw" / "99-delivery" / "MANIFEST.json").write_text(json.dumps({
        "schema_version": "2.0", "session_id": "SES-001", "folder": design.name,
        "title": "source", "created_at": manifest["created_at"], "modes": ["document"], "session_kind": "general",
    }), encoding="utf-8")
    return session, manifest, {"session": str(design), "package": str(package), "entrypoint": "index.html"}


def selected(session, template="ui-component-output"):
    select_design(session, "prototype", template, session / "prototype-source.zip")
    select_design(session, "prototype", "reading-html", session / f"{session.name}.html")


def cli_stub(reference, calls, *, failed=False, proof=COMPONENT_PROOF):
    def run(argv, **kwargs):
        calls.append(argv)
        if Path(argv[3]).name == "check_document.py":
            return REAL_SUBPROCESS_RUN(argv, **kwargs)
        assert Path(argv[3]).name == "ui_package.py"
        if failed:
            return subprocess.CompletedProcess(argv, 2, "ERROR: browser audit changed", "")
        if argv[4] == "export":
            output = Path(argv[argv.index("--out") + 1])
            output.parent.mkdir(parents=True, exist_ok=True)
            package = Path(reference["package"])
            with zipfile.ZipFile(output, "x") as archive:
                for file in package.rglob("*"):
                    if file.is_file():
                        archive.write(file, file.relative_to(package).as_posix())
        return subprocess.CompletedProcess(argv, 0, json.dumps(proof), "")
    return run


def test_ui_publication_keeps_every_asset_in_the_complete_archive(tmp_path, monkeypatch):
    session, manifest, reference = setup(tmp_path)
    selected(session)
    calls = []
    monkeypatch.setattr(publish.subprocess, "run", cli_stub(reference, calls))
    result = publish.publish_ui_source(session, "prototype", manifest, reference)
    assert [Path(call[3]).name for call in calls] == ["ui_package.py", "ui_package.py", "check_document.py"]
    assert [call[4] for call in calls[:2]] == ["check", "export"]
    archive = session / "prototype-source.zip"
    package = Path(reference["package"])
    with zipfile.ZipFile(archive) as zipped:
        assert {name: zipped.read(name) for name in zipped.namelist()} == {
            file.relative_to(package).as_posix(): file.read_bytes() for file in package.rglob("*") if file.is_file()}
    page = result.read_text(encoding="utf-8")
    assert 'href="prototype-source.zip"' in page
    assert "<script src=" not in page
    assert str(package) not in page
    library = publish.design_module("template_library")
    library.require_selected(session, "luz-system", "prototype", archive, "ui-component-output", phase="post")
    library.require_selected(session, "luz-system", "prototype", result, "reading-html", phase="post")
    assert validate_session.validate(session, allow_live_crawl_offline=True) == []
    archive.write_bytes(b"changed after generation")
    with pytest.raises(ValueError, match="哈希"):
        library.require_selected(session, "luz-system", "prototype", archive, "ui-component-output", phase="post")


def test_frontend_package_is_bound_to_the_template_it_was_built_from(tmp_path, monkeypatch):
    """A frontend.py package lists its entries in entry_files and names its own registered template (frontend-*)."""
    session, manifest, reference = setup(tmp_path)
    selected(session, "frontend-existing")
    calls = []
    monkeypatch.setattr(publish.subprocess, "run", cli_stub(reference, calls, proof=FRONTEND_PROOF))
    result = publish.publish_ui_source(session, "prototype", manifest, reference)
    archive = session / "prototype-source.zip"
    library = publish.design_module("template_library")
    library.require_selected(session, "luz-system", "prototype", archive, "frontend-existing", phase="post")
    library.require_selected(session, "luz-system", "prototype", result, "reading-html", phase="post")
    published = json.loads((session / "raw" / "99-delivery" / "MANIFEST.json").read_text(encoding="utf-8"))
    assert published["source_ui_publications"]["prototype"]["template_id"] == "frontend-existing"
    assert validate_session.validate(session, allow_live_crawl_offline=True) == []


@pytest.mark.parametrize("proof", [
    {"template_id": "offline-source-fixture", "entrypoints": ["index.html"]},                             # no type at all
    {"mode": "source-locked", "template_id": "ui-source-output", "entrypoints": ["index.html"]},          # a type Design no longer registers
    {"mode": "component-reuse", "template_id": "frontend-existing", "entrypoints": ["index.html"]},       # type and template disagree
    {"mode": "frontend", "template_id": "frontend-unregistered", "entry_files": {"0": "index.html"}},     # not in the template library
    {"mode": "frontend", "template_id": "html-templates-web", "entry_files": {"0": "index.html"}},        # a reference-only catalogue
])
def test_package_type_without_a_registered_template_is_refused_before_any_file(tmp_path, monkeypatch, proof):
    session, manifest, reference = setup(tmp_path)
    selected(session)
    calls = []
    monkeypatch.setattr(publish.subprocess, "run", cli_stub(reference, calls, proof=proof))
    before = {p: p.read_bytes() for p in session.rglob("*") if p.is_file()}
    with pytest.raises(ValueError, match="没有在 Luz-Design 模板库登记") as refusal:
        publish.publish_ui_source(session, "prototype", manifest, reference)
    assert "ui-component-output" in str(refusal.value) and "frontend-*" in str(refusal.value)
    assert [call[4] for call in calls] == ["check"]
    assert {p: p.read_bytes() for p in session.rglob("*") if p.is_file()} == before
    assert not list((Path(reference["session"]) / "raw" / "99-delivery").glob("system-exports/*"))


def test_changed_source_audit_cannot_create_official_files(tmp_path, monkeypatch):
    session, manifest, reference = setup(tmp_path)
    selected(session)
    calls = []
    monkeypatch.setattr(publish.subprocess, "run", cli_stub(reference, calls, failed=True))
    before = {p: p.read_bytes() for p in session.rglob("*") if p.is_file()}
    with pytest.raises(ValueError, match="审计未通过"):
        publish.publish_ui_source(session, "prototype", manifest, reference)
    assert {p: p.read_bytes() for p in session.rglob("*") if p.is_file()} == before


def test_ui_publication_requires_actual_template_selections(tmp_path, monkeypatch):
    session, manifest, reference = setup(tmp_path)
    calls = []
    monkeypatch.setattr(publish.subprocess, "run", cli_stub(reference, calls))
    with pytest.raises(ValueError, match="模板选择"):
        publish.publish_ui_source(session, "prototype", manifest, reference)
    assert len(calls) == 1
    assert not (session / "prototype-source.zip").exists()


@pytest.mark.parametrize("fault", ["research", "layout"])
def test_direct_ui_publication_checks_exact_research_and_root_before_any_cli(tmp_path, monkeypatch, fault):
    session, manifest, reference = setup(tmp_path)
    selected(session)
    if fault == "research":
        (session / "raw" / "00-crawl" / "luz-system-prototype.json").unlink()
    else:
        (session / "leaked.json").write_text("{}", encoding="utf-8")
    calls = []
    monkeypatch.setattr(publish.subprocess, "run", cli_stub(reference, calls))
    before = {p: p.read_bytes() for p in session.rglob("*") if p.is_file()}
    with pytest.raises(ValueError, match="research gate|session root"):
        publish.publish_ui_source(session, "prototype", manifest, reference)
    assert calls == []
    assert {p: p.read_bytes() for p in session.rglob("*") if p.is_file()} == before


def test_nominal_document_selection_cannot_accept_an_invented_shell(tmp_path):
    file = tmp_path / "document.html"
    file.write_text("<html><head><title>伪造模板</title></head><body><h1>伪造模板</h1></body></html>", encoding="utf-8")
    with pytest.raises(ValueError, match="真实模板外壳"):
        publish.verify_document_template(file, "system-design")


def test_native_registered_hash_route_keeps_its_fragment(tmp_path, monkeypatch):
    design = tmp_path / "design"
    package = design / "raw" / "package"
    package.mkdir(parents=True)
    (package / "index.html").write_text("offline hash-route fixture", encoding="utf-8")
    reference = {"session": str(design), "package": str(package), "entrypoint": "index.html#home"}
    proof = {"template_id": "offline-hash-route", "entrypoints": ["index.html#home"]}
    monkeypatch.setattr(publish.subprocess, "run", lambda argv, **kwargs: subprocess.CompletedProcess(argv, 0, json.dumps(proof), ""))
    assert publish.verify_ui_source(reference) == proof
    # A frontend.py package has no entrypoints list: its registered entries are the values of entry_files.
    frontend = {"mode": "frontend", "template_id": "frontend-existing", "entry_files": {"0": "index.html"}}
    monkeypatch.setattr(publish.subprocess, "run", lambda argv, **kwargs: subprocess.CompletedProcess(argv, 0, json.dumps(frontend), ""))
    assert publish.verify_ui_source({**reference, "entrypoint": "index.html"}) == frontend
    with pytest.raises(ValueError, match="登记入口"):
        publish.verify_ui_source(reference)
