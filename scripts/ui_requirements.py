"""Validate the behavior contract before UI selection or composition.

This checks structure and traceability, not whether a claimed user statement is
true. The author must review cited inputs and bind this file to the stage record.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

LEGACY_SCHEMA = 'luz-ui-requirements/1'
SCHEMA = 'luz-ui-requirements/2'
STATES = ('default', 'loading', 'empty', 'success', 'error', 'disabled', 'permission_denied', 'offline')


def text(value):
    return isinstance(value, str) and bool(value.strip())


def ownership_errors(data, groups):
    """Check declared action homes per UI context. Wording cannot establish business equivalence."""
    errors = []
    pages = groups['pages']
    parents, scopes = {}, {}
    for key, page in pages.items():
        scope = page.get('entry_scope', 'default')
        if not text(scope):
            errors.append(f'{key}: entry_scope must name a UI context')
        scopes[key] = scope if text(scope) else 'default'
        parent = page.get('parent_page_id')
        if parent is not None:
            if text(parent) and parent in pages:
                parents[key] = parent
            else:
                errors.append(f'{key}: unknown parent_page_id')
    ancestors = {}
    for key in pages:
        path = set()
        node = key
        while node is not None and node not in path:
            path.add(node)
            node = parents.get(node)
        if node is not None:
            errors.append(f'{key}: parent_page_id cycle')
        if any(scopes[parent] != scopes[key] for parent in path):
            errors.append(f'{key}: parent crosses entry_scope')
        ancestors[key] = path

    declared = data.get('action_groups', [])
    if not isinstance(declared, list):
        return errors + ['action_groups must be a list']
    owned_features = set()
    for page, chain in ancestors.items():
        features = pages[page].get('feature_ids')
        if isinstance(features, list):
            owned_features.update(
                (ancestor, feature) for ancestor in chain for feature in features if text(feature)
            )
    homes, ids = {}, set()
    for row in declared:
        if not isinstance(row, dict) or not text(row.get('id')):
            errors.append('action_groups: every group needs an id')
            continue
        key, owner = row['id'], row.get('owner_page_id')
        if key in ids:
            errors.append(f'{key}: duplicate action group id')
        ids.add(key)
        if not text(owner) or owner not in pages:
            errors.append(f'{key}: unknown owner_page_id')
            continue
        features = row.get('feature_ids')
        if not isinstance(features, list) or not features:
            errors.append(f'{key}: feature_ids must list the functions owned here')
            continue
        for feature in features:
            if not text(feature) or feature not in groups['features']:
                errors.append(f'{key}: unknown feature in action group')
                continue
            if (owner, feature) not in owned_features:
                errors.append(f'{feature}: owner {owner} or its subflow must expose this function')
            pair = (scopes[owner], feature)
            if pair in homes:
                errors.append(f'{feature}: assigned multiple action groups within {scopes[owner]}')
            homes[pair] = owner

    for action in groups['actions'].values():
        key, feature, page = action['id'], action.get('feature_id'), action.get('page_id')
        if not text(page) or page not in pages:
            continue  # the ordinary action validator reports this
        if not text(feature) or feature not in groups['features']:
            errors.append(f'{key}: feature_id must identify the function performed or opened')
            continue
        cid = action.get('component_id')
        component = groups['components'].get(cid, {}) if text(cid) else {}
        if not isinstance(component.get('feature_ids'), list) or feature not in component['feature_ids']:
            errors.append(f'{key}: feature_id is outside its component')
        owner = homes.get((scopes[page], feature))
        if owner is None:
            errors.append(f'{key}: no action group for {feature} within {scopes[page]}')
        elif 'target_page_id' in action:
            target = action['target_page_id']
            inside_group = owner in ancestors[page]
            if (not text(target) or target not in pages
                    or owner not in ancestors[target] or (not inside_group and target != owner)):
                errors.append(f'{key}: target_page_id must enter {owner} from outside or stay in its subflow')
        elif owner not in ancestors[page]:
            errors.append(f'{key}: execute in owner page {owner} or its subflow, or navigate there')
        if 'rule_refs' in action:
            refs = action['rule_refs']
            if (not isinstance(refs, list) or any(not text(r) or r not in groups['features'] for r in refs)
                    or len(refs) != len(set(refs))):
                errors.append(f'{key}: rule_refs must be distinct existing feature IDs')
    return errors


def page_structure_errors(data, groups):
    """Check the ordered inventory on new handoffs while retaining legacy readers."""
    if data.get('schema') != SCHEMA:
        return ['page structure requires luz-ui-requirements/2']
    if type(data.get('page_structure_version')) is not int or data['page_structure_version'] not in (1, 2):
        return ['page_structure_version must be 1 or 2 for a structured handoff']
    errors = []
    modules = data.get('modules')
    if not isinstance(modules, list) or not modules:
        errors.append('modules: list the business modules')
        modules = []
    module_ids = set()
    for module in modules:
        if not isinstance(module, dict) or not all(text(module.get(k)) for k in ('id','name','owner','object','outcome')):
            errors.append('modules: each module needs id, name, owner, object and outcome')
            continue
        if module['id'] in module_ids:
            errors.append(f"modules: duplicate id {module['id']}")
        module_ids.add(module['id'])
    used_modules = set()
    for key, feature in groups['features'].items():
        owner = feature.get('module_id')
        if not text(owner) or owner not in module_ids:
            errors.append(f'{key}: unknown business module_id')
        else:
            used_modules.add(owner)
    for key in sorted(module_ids - used_modules):
        errors.append(f'{key}: business module owns no feature')

    for key, page in groups['pages'].items():
        if not text(page.get('focus')):
            errors.append(f'{key}: focus must name the first fact or decision')
        sections = page.get('sections')
        if not isinstance(sections, list) or not sections:
            errors.append(f'{key}: ordered sections are required')
            continue
        declared = page.get('component_ids')
        expected = {item for item in declared if text(item)} if isinstance(declared, list) else set()
        placed, section_ids = set(), set()
        for section in sections:
            if not isinstance(section, dict) or not text(section.get('id')) or not text(section.get('goal')):
                errors.append(f'{key}: section needs id and goal')
                continue
            section_id = section['id']
            if section_id in section_ids:
                errors.append(f'{key}: duplicate section id {section_id}')
            section_ids.add(section_id)
            items = section.get('component_ids')
            if not isinstance(items, list) or not items:
                errors.append(f'{key}/{section_id}: section needs ordered component_ids')
                continue
            for item in items:
                if not text(item) or item not in expected:
                    errors.append(f'{key}/{section_id}: unknown page component {item}')
                elif item in placed:
                    errors.append(f'{key}/{section_id}: component {item} occurs twice')
                else:
                    placed.add(item)
        for item in sorted(expected - placed):
            errors.append(f'{key}: component {item} has no section')

    action_locations = {(row['page_id'], row['component_id']) for row in groups['actions'].values()
                        if text(row.get('page_id')) and text(row.get('component_id'))}
    for key, component in groups['components'].items():
        mode = component.get('interaction')
        if not text(component.get('kind')) or not text(component.get('label')):
            errors.append(f'{key}: kind and label are required')
        if mode not in ('display', 'input', 'action'):
            errors.append(f'{key}: interaction must be display, input or action')
            continue
        kind = component.get('kind')
        if kind in ('button', 'link', 'tab') and mode != 'action':
            errors.append(f'{key}: {kind} must declare an action')
        if kind == 'choice' and mode != 'input':
            errors.append(f'{key}: choice must declare input behavior')
        if mode == 'input':
            for field in ('required_when', 'validation'):
                if not text(component.get(field)):
                    errors.append(f'{key}: input needs {field}')
        if kind == 'choice' and not text(component.get('options')):
            errors.append(f'{key}: choice needs options or their source')
        page_ids = component.get('page_ids')
        for page_id in page_ids if isinstance(page_ids, list) else []:
            if not text(page_id):
                continue
            has_action = (page_id, key) in action_locations
            if mode == 'action' and not has_action:
                errors.append(f'{page_id}/{key}: interactive component has no action')
            if mode == 'display' and has_action:
                errors.append(f'{page_id}/{key}: display component owns an action')
    return errors


def module_detail_errors(data, groups):
    """Check the module-owned business data and the modules involved in each journey."""
    errors = []
    rows = data.get('modules')
    if not isinstance(rows, list):
        return ['modules: list the module data definitions']
    modules = {m['id']: m for m in rows if isinstance(m, dict) and text(m.get('id'))}
    objects, references = set(), []
    for mid, module in modules.items():
        records = module.get('data_objects')
        if not isinstance(records, list):
            errors.append(f'{mid}: data_objects must be a list')
            continue
        if not records and not text(module.get('data_note')):
            errors.append(f'{mid}: name the external data source or explain why no data is needed in data_note')
        for record in records:
            if not isinstance(record, dict) or not all(text(record.get(k)) for k in ('id', 'name', 'identity', 'access')):
                errors.append(f'{mid}: each data object needs id, name, identity and access')
                continue
            oid = record['id']
            if oid in objects:
                errors.append(f'{mid}: duplicate data object id {oid}')
            objects.add(oid)
            fields = record.get('fields')
            if not isinstance(fields, list) or not fields:
                errors.append(f'{mid}/{oid}: list the business fields')
                continue
            names = set()
            for field in fields:
                if not isinstance(field, dict) or not all(text(field.get(k)) for k in ('name', 'type', 'source', 'rule')):
                    errors.append(f'{mid}/{oid}: each field needs name, type, source and rule')
                    continue
                name = field['name']
                if name in names:
                    errors.append(f'{mid}/{oid}: duplicate field {name}')
                names.add(name)
                if 'reference' in field:
                    references.append((f'{mid}/{oid}/{name}', field['reference']))
            if record['identity'] not in names:
                errors.append(f'{mid}/{oid}: identity must name a declared field')
    for location, target in references:
        if not text(target) or target not in objects:
            errors.append(f'{location}: unknown referenced data object')

    covered = set()
    for jid, journey in groups['journeys'].items():
        ids = journey.get('module_ids')
        if not isinstance(ids, list) or not ids or any(not text(mid) or mid not in modules for mid in ids):
            errors.append(f'{jid}: module_ids must identify the participating modules')
            continue
        if len(set(ids)) != len(ids):
            errors.append(f'{jid}: duplicate participating module')
        covered.update(ids)
        for aid in journey['action_ids'] if isinstance(journey.get('action_ids'), list) else []:
            action = groups['actions'].get(aid, {}) if text(aid) else {}
            fid = action.get('feature_id')
            owner = groups['features'].get(fid, {}).get('module_id') if text(fid) else None
            if text(owner) and owner not in ids:
                errors.append(f'{jid}: module_ids must include {owner} for action {aid}')
    mapped_features = {fid for page in groups['pages'].values() if isinstance(page.get('feature_ids'), list)
                       for fid in page['feature_ids'] if text(fid)}
    for mid in sorted(modules.keys() - covered):
        if any(f['id'] in mapped_features and f.get('module_id') == mid for f in groups['features'].values()):
            errors.append(f'{mid}: include the module in a user journey')
        elif not text(modules[mid].get('internal_flow')):
            errors.append(f'{mid}: identify a journey or describe the internal_flow')
    return errors


def entry_errors(data, groups):
    """Follow each entrance one screen at a time. A role handoff starts a separate entrance."""
    entries = data.get('entries')
    if not isinstance(entries, list) or not entries:
        return ['entries: describe the pages reached from each user entrance']
    errors, seen, reached, used_navigation = [], set(), set(), set()
    pages, actions = groups['pages'], groups['actions']
    for entry in entries:
        if not isinstance(entry, dict) or not all(text(entry.get(k)) for k in ('id', 'label', 'source', 'context', 'return_to')):
            errors.append('entries: each entrance needs id, label, source, context and return_to')
            continue
        eid, first = entry['id'], entry.get('page_id')
        if eid in seen:
            errors.append(f'{eid}: duplicate entrance')
        seen.add(eid)
        if not text(first) or first not in pages:
            errors.append(f'{eid}: unknown landing page')
            continue
        scope = pages[first].get('entry_scope', 'default')
        origin = None
        if 'source_action_id' in entry:
            aid = entry['source_action_id']
            action = actions.get(aid, {}) if text(aid) else {}
            origin = action.get('page_id')
            if (action.get('target_page_id') != first or not text(origin) or origin not in pages
                    or pages[origin].get('entry_scope', 'default') != scope):
                errors.append(f'{eid}: source_action_id must open the landing page in the same role')
                continue
            used_navigation.add(aid)
        reached.add(first)
        paths = entry.get('paths')
        if not isinstance(paths, list) or not paths:
            errors.append(f'{eid}: list at least one user path')
            continue
        for path in paths:
            if (not isinstance(path, dict) or not text(path.get('when')) or not text(path.get('result'))
                    or not isinstance(path.get('steps'), list)):
                errors.append(f'{eid}: each path needs when, ordered steps and result')
                continue
            history = [origin, first] if origin else [first]
            for step in path['steps']:
                if not isinstance(step, dict):
                    errors.append(f'{eid}: invalid path step')
                    break
                target = step.get('page_id')
                if not text(target) or target not in pages or pages[target].get('entry_scope', 'default') != scope:
                    errors.append(f'{eid}: unknown destination or cross-role page in path')
                    break
                triggers = [k for k in ('action_id', 'back', 'event') if k in step]
                if len(triggers) != 1 or ('back' in step and 'history' in step):
                    errors.append(f'{eid}: step needs one action, back or event')
                    break
                current = history[-1]
                if 'back' in step:
                    if step['back'] is not True or len(history) < 2 or history[-2] != target:
                        errors.append(f'{eid}: back must restore the previous page')
                        break
                    history.pop()
                else:
                    if 'action_id' in step:
                        aid = step['action_id']
                        action = actions.get(aid, {}) if text(aid) else {}
                        if action.get('page_id') != current:
                            errors.append(f'{eid}: action {aid} does not belong to current page {current}')
                            break
                        if 'target_page_id' in action:
                            if target != current and target != action['target_page_id']:
                                errors.append(f'{eid}: action {aid} opens a different destination')
                                break
                            if target == action['target_page_id']:
                                used_navigation.add(aid)
                    elif not text(step['event']):
                        errors.append(f'{eid}: name the event that changes the view')
                        break
                    mode = step.get('history', 'push')
                    if mode not in ('push','replace','return'):
                        errors.append(f'{eid}: unknown page history behavior')
                        break
                    if mode == 'return':
                        if target not in history[:-1]:
                            errors.append(f'{eid}: return must reopen an earlier page')
                            break
                        history.pop()
                        while history[-1] != target:
                            history.pop()
                    elif mode == 'replace':
                        history[-1] = target
                    elif target != current:
                        history.append(target)
                reached.add(target)
    for pid in sorted(pages.keys() - reached):
        errors.append(f'{pid}: page is unreachable from declared entrances')
    for aid, action in actions.items():
        if 'target_page_id' in action and aid not in used_navigation:
            errors.append(f'{aid}: navigation is absent from entrance paths')
    return errors


def entry_view(data, entry_id):
    entry = next((e for e in data['entries'] if e['id'] == entry_id), None)
    if entry is None:
        raise ValueError(f'unknown entrance {entry_id}')
    pages = {p['id']: p for p in data['pages']}
    labels = {c['id']: c['label'] for c in data['components']}
    action_names = {a['id']: a['name'] for a in data['actions']}
    first = entry['page_id']
    visited, branches = {first: None}, []
    for path in entry['paths']:
        visits = [first]
        steps = []
        for step in path['steps']:
            pid = step['page_id']
            if visits[-1] != pid:
                visits.append(pid)
            visited[pid] = None
            trigger = action_names[step['action_id']] if 'action_id' in step else step.get('event', '返回')
            steps.append({**step, 'trigger_label': trigger, 'page_title': pages[pid]['title']})
        branches.append({**path, 'steps': steps, 'visits': visits, 'page_titles': [pages[pid]['title'] for pid in visits],
                         'page_count': len(set(visits))})
    screens = []
    for pid in visited:
        page = pages[pid]
        groups = [{'goal': s['goal'], 'controls': [labels[c] for c in s['component_ids']]} for s in page['sections']]
        screens.append({k: page[k] for k in ('id','title','goal','entry','focus','exit','states')}
                       | {'ordered_content': groups, 'primary_action': page.get('primary_action')})
    return {k: entry[k] for k in ('id','label','source','context','return_to')} | {
        'entry_scope': pages[first].get('entry_scope', 'default'), 'landing_page': first,
        'page_count': len(screens), 'pages': screens, 'paths': branches}


def module_view(data, module_id):
    """Read the five aspects of one validated module without copying functional definitions."""
    module = next((m for m in data['modules'] if m['id'] == module_id), None)
    if module is None:
        raise ValueError(f'unknown module {module_id}')
    features = [f for f in data['features'] if f['module_id'] == module_id]
    feature_ids = {f['id'] for f in features}
    components = [c for c in data['components'] if feature_ids.intersection(c['feature_ids'])]
    controls = {c['id'] for c in components}
    layout = []
    for page in data['pages']:
        if not feature_ids.intersection(page['feature_ids']):
            continue
        sections = []
        for position, section in enumerate(page['sections'], start=1):
            ids = [cid for cid in section['component_ids'] if cid in controls]
            if ids:
                sections.append({'position': position, **section, 'component_ids': ids})
        layout.append({k: page[k] for k in ('id', 'route', 'goal', 'entry', 'focus', 'exit', 'states')}
                      | {'sections': sections, 'page_primary_action': page.get('primary_action')})
    page_ids = {p['id'] for p in layout}
    entries = [e['id'] for e in data['entries'] if e['page_id'] in page_ids
               or any(s['page_id'] in page_ids for path in e['paths'] for s in path['steps'])]
    return {
        'module': {k: module[k] for k in ('id', 'name', 'owner', 'object', 'outcome')},
        'function_logic': features,
        'data_structure': {'objects': module['data_objects'], 'note': module.get('data_note', '')},
        'layout': layout, 'entry_ids': entries,
        'interaction': {'components': components, 'actions': [a for a in data['actions'] if a['feature_id'] in feature_ids]},
        'flows': {'journeys': [j for j in data['journeys'] if module_id in j['module_ids']],
                  'internal_flow': module.get('internal_flow', ''),
                  'non_ui_features': [f for f in data['non_ui_features'] if f['feature_id'] in feature_ids]},
    }


def validate(data, *, require_page_structure=False, require_module_details=False):
    errors = []
    if not isinstance(data, dict):
        return ['UI requirements must be an object']
    if data.get('schema') not in (LEGACY_SCHEMA, SCHEMA):
        errors.append('Unsupported UI requirements schema')
    groups = {}
    for name in ('features', 'pages', 'actions', 'components', 'journeys'):
        rows = data.get(name)
        if not isinstance(rows, list) or (name != 'actions' and not rows):
            errors.append(f'{name}: a nonempty list is required')
            rows = []
        indexed = {}
        for row in rows:
            if not isinstance(row, dict) or not text(row.get('id')):
                errors.append(f'{name}: every item needs an id')
                continue
            key = row['id']
            if key in indexed:
                errors.append(f'{name}: duplicate id {key}')
            indexed[key] = row
        groups[name] = indexed

    def required(row, fields):
        for field in fields:
            if not text(row.get(field)):
                errors.append(f"{row['id']}: {field} must explain the required behavior")

    def refs(row, field, group, empty=False):
        values = row.get(field)
        if not isinstance(values, list) or (not empty and not values):
            errors.append(f"{row['id']}: {field} needs explicit references")
            return []
        clean = []
        for key in values:
            if not text(key) or key not in groups[group]:
                errors.append(f"{row['id']}: unknown {field} {key}")
            elif key in clean:
                errors.append(f"{row['id']}: duplicate {field} {key}")
            else:
                clean.append(key)
        return clean

    def string_list(value):
        return [item for item in value if text(item)] if isinstance(value, list) else []

    for row in groups['features'].values():
        required(row, ('need', 'acceptance'))
        basis = row.get('basis')
        if (not isinstance(basis, dict) or not text(basis.get('kind'))
                or basis.get('kind') not in {'user', 'research', 'existing_system', 'decision'}
                or not text(basis.get('ref'))):
            errors.append(f"{row['id']}: verified basis kind and reference are required; unverified facts stay blocked")
        elif basis['kind'] == 'decision' and not text(basis.get('rationale')):
            errors.append(f"{row['id']}: a proposed decision needs its rationale and must not be presented as a user fact")
        if isinstance(basis, dict) and (basis.get('verified') is False or basis.get('status') == 'unverified'):
            errors.append(f"{row['id']}: explicitly unverified basis stays blocked")

    routes = {}
    used_features, used_components = set(), set()
    for row in groups['pages'].values():
        required(row, ('route', 'goal', 'entry', 'exit'))
        route = row.get('route')
        if text(route):
            structured_screens = data.get('page_structure_version') == 2
            view = row.get('view_key', '') if structured_screens else ''
            if structured_screens and 'view_key' in row and not text(view):
                errors.append(f'{row["id"]}: view_key must name a screen within the route')
                view = ''
            prior = routes.setdefault(route, set())
            if prior and (not view or '' in prior or view in prior):
                errors.append(f'{row["id"]}: duplicate route {route}; shared screens must have distinct view_key values')
            prior.add(view)
        used_features.update(refs(row, 'feature_ids', 'features'))
        used_components.update(refs(row, 'component_ids', 'components'))
        for key in string_list(row.get('component_ids')):
            component = groups['components'].get(key)
            if component and row['id'] not in string_list(component.get('page_ids')):
                errors.append(f"{row['id']}: component {key} does not declare this page")
        states = row.get('states')
        if not isinstance(states, dict): states = {}
        for state in STATES:
            if not text(states.get(state)):
                errors.append(f"{row['id']}: state {state} needs behavior or a reason it does not apply")
        action = row.get('primary_action')
        if action is None and text(row.get('read_only_reason')):
            pass
        elif not text(action) or action not in groups['actions']:
            errors.append(f"{row['id']}: primary_action is unknown")
        elif groups['actions'][action].get('page_id') != row['id']:
            errors.append(f"{row['id']}: primary_action belongs to another page")

    for row in groups['actions'].values():
        required(row, ('name', 'precondition', 'result', 'error', 'recovery', 'permission'))
        page = groups['pages'].get(row.get('page_id')) if text(row.get('page_id')) else None
        component = groups['components'].get(row.get('component_id')) if text(row.get('component_id')) else None
        if page is None: errors.append(f"{row['id']}: unknown page_id")
        if component is None: errors.append(f"{row['id']}: unknown component_id")
        if page and row.get('component_id') not in string_list(page.get('component_ids')):
            errors.append(f"{row['id']}: action component does not belong to its page")

    for row in groups['components'].values():
        required(row, ('purpose', 'behavior', 'data_contract', 'acceptance'))
        pages = refs(row, 'page_ids', 'pages')
        features = refs(row, 'feature_ids', 'features')
        for page_id in pages:
            page = groups['pages'][page_id]
            if row['id'] not in string_list(page.get('component_ids')):
                errors.append(f"{row['id']}: page mapping is not reciprocal for {page_id}")
            if not set(features).issubset(string_list(page.get('feature_ids'))):
                errors.append(f"{row['id']}: component features are not covered by {page_id}")
        states = row.get('states')
        if not isinstance(states, list) or not states or any(not text(s) or s not in STATES for s in states):
            errors.append(f"{row['id']}: states must name applicable state categories")
        if row['id'] not in used_components:
            errors.append(f"{row['id']}: orphan component")

    journey_actions, journey_pages = set(), set()
    for row in groups['journeys'].values():
        required(row, ('expected', 'recovery'))
        pages = refs(row, 'page_ids', 'pages')
        read_only = bool(pages) and all(text(groups['pages'][key].get('read_only_reason'))
                                      and groups['pages'][key].get('primary_action') is None for key in pages)
        actions = refs(row, 'action_ids', 'actions', empty=read_only)
        journey_pages.update(pages); journey_actions.update(actions)
        for action in actions:
            if groups['actions'][action].get('page_id') not in pages:
                errors.append(f"{row['id']}: action {action} is outside the journey pages")
    for key in groups['actions'].keys() - journey_actions:
        errors.append(f'{key}: orphan action absent from journeys')
    for key in groups['pages'].keys() - journey_pages:
        errors.append(f'{key}: page absent from journeys')
    non_ui = data.get('non_ui_features')
    excluded = set()
    if not isinstance(non_ui, list):
        errors.append('non_ui_features must explicitly list exclusions, or be empty')
        non_ui = []
    for row in non_ui:
        if not isinstance(row, dict) or not text(row.get('feature_id')) or row.get('feature_id') not in groups['features'] or not text(row.get('reason')):
            errors.append('non_ui_features needs an existing feature_id and reason')
        elif row['feature_id'] in excluded or row['feature_id'] in used_features:
            errors.append('non_ui_features cannot duplicate a mapped or excluded feature')
        else:
            excluded.add(row['feature_id'])
    for key in groups['features'].keys() - used_features - excluded:
        errors.append(f'{key}: feature has no UI mapping or explicit non-UI exclusion')
    if data.get('schema') == SCHEMA:
        errors.extend(ownership_errors(data, groups))
    if require_page_structure or require_module_details or 'page_structure_version' in data:
        errors.extend(page_structure_errors(data, groups))
    if data.get('page_structure_version') == 2:
        errors.extend(module_detail_errors(data, groups))
        errors.extend(entry_errors(data, groups))
        for pid, page in groups['pages'].items():
            if not text(page.get('title')):
                errors.append(f'{pid}: title must name this screen in the entrance path')
    elif require_module_details:
        errors.append('page_structure_version 2 is required for module details')
    return list(dict.fromkeys(errors))


def check(path, *, require_page_structure=False, require_module_details=False, module_id=None, entry_id=None):
    path = Path(path).resolve()
    content = path.read_bytes()
    data = json.loads(content.decode('utf-8-sig'))
    errors = validate(data, require_page_structure=require_page_structure,
                      require_module_details=require_module_details or module_id is not None or entry_id is not None)
    if errors:
        raise ValueError('; '.join(errors))
    report = {'schema': data['schema'], 'path': str(path), 'sha256': hashlib.sha256(content).hexdigest(),
              'counts': {key: len(data[key]) for key in ('features','pages','actions','components','journeys')}}
    if module_id is not None:
        report['module_view'] = module_view(data, module_id)
    if entry_id is not None:
        report['entry_view'] = entry_view(data, entry_id)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('path', type=Path)
    parser.add_argument('--require-page-structure', action='store_true',
                        help='require the ordered page and control inventory for a new handoff')
    parser.add_argument('--require-module-details', action='store_true',
                        help='require the module data dictionary and flow ownership on a new handoff')
    parser.add_argument('--module', help='show one module with its logic, business data, ordered sections, interactions and flows')
    parser.add_argument('--entry', help='follow an entrance, count distinct screens and show their ordered content and branches')
    args = parser.parse_args()
    try:
        result = {'ok': True, **check(args.path, require_page_structure=args.require_page_structure,
                                      require_module_details=args.require_module_details, module_id=args.module,
                                      entry_id=args.entry)}
    except (OSError, ValueError, TypeError, KeyError) as exc:
        print(json.dumps({'ok': False, 'error': str(exc)}, ensure_ascii=False)); return 1
    print(json.dumps(result, ensure_ascii=False, indent=2)); return 0


if __name__ == '__main__':
    raise SystemExit(main())
