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


def validate(data):
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

    routes = set()
    used_features, used_components = set(), set()
    for row in groups['pages'].values():
        required(row, ('route', 'goal', 'entry', 'exit'))
        route = row.get('route')
        if text(route):
            if route in routes: errors.append(f'{row["id"]}: duplicate route {route}')
            routes.add(route)
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
    return list(dict.fromkeys(errors))


def check(path):
    path = Path(path).resolve()
    data = json.loads(path.read_text(encoding='utf-8-sig'))
    errors = validate(data)
    if errors:
        raise ValueError('; '.join(errors))
    return {'schema': data['schema'], 'path': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'counts': {key: len(data[key]) for key in ('features','pages','actions','components','journeys')}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('path', type=Path)
    args = parser.parse_args()
    try:
        result = {'ok': True, **check(args.path)}
    except (OSError, ValueError, TypeError, KeyError) as exc:
        print(json.dumps({'ok': False, 'error': str(exc)}, ensure_ascii=False)); return 1
    print(json.dumps(result, ensure_ascii=False, indent=2)); return 0


if __name__ == '__main__':
    raise SystemExit(main())
