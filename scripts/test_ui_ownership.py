"""Regression cases for a shared settings entry and cross-page rule references."""
import copy
import json
import unittest
from pathlib import Path

from ui_requirements import STATES, check, entry_view, module_view, validate


def account_contract():
    names = {'FN-1': '修改自己的密码', 'FN-2': '切换账号', 'FN-3': '管理员重置员工密码'}
    pages = []; components = []; actions = []
    def page(key, feature_ids, ops, parent=None):
        row = {'id': key, 'route': '/' + key, 'goal': key, 'entry': '菜单', 'exit': '返回',
               'states': {s: '用例说明' for s in STATES}, 'feature_ids': feature_ids,
               'component_ids': ['C-' + key], 'primary_action': ops[0][0]}
        if parent: row['parent_page_id'] = parent
        pages.append(row)
        components.append({'id':'C-' + key, 'purpose':'入口', 'behavior':'点击', 'data_contract':'当前会话',
                           'acceptance':'可达', 'page_ids':[key], 'feature_ids':list(feature_ids), 'states':['default']})
        for action_id, feature, target in ops:
            action = {'id':action_id,'feature_id':feature,'name':names[feature],'precondition':'已授权','result':'完成',
                      'error':'可重试','recovery':'返回','permission':'所属角色','page_id':key,'component_id':'C-'+key}
            if target: action['target_page_id'] = target
            actions.append(action)
    page('home',['FN-1'],[('avatar','FN-1','personal-settings')]); page('personal-settings',['FN-2'],[('switch','FN-2',None)])
    page('edit-password',['FN-1'],[('change','FN-1',None)],parent='personal-settings')
    page('staff',['FN-3'],[('reset','FN-3',None)])
    return {'schema':'luz-ui-requirements/2','features':[{'id':k,'need':v,'acceptance':v,'basis':{'kind':'user','ref':'测试要求'}} for k,v in names.items()],
            'action_groups':[{'id':'self-account','owner_page_id':'personal-settings','feature_ids':['FN-1','FN-2']},
                             {'id':'staff-management','owner_page_id':'staff','feature_ids':['FN-3']}],
            'pages':pages,'components':components,'actions':actions,'non_ui_features':[],
            'journeys':[{'id':'review','page_ids':[r['id'] for r in pages], 'action_ids':[r['id'] for r in actions],
                         'expected':'各角色可达','recovery':'取消'}]}


class OwnershipTests(unittest.TestCase):
    def structured_contract(self):
        return json.loads((Path(__file__).resolve().parents[1] / 'examples' / 'booking-change.ui.json').read_text(encoding='utf-8'))

    def test_new_contract_and_legacy_review(self):
        self.assertEqual(validate(self.structured_contract(), require_page_structure=True), [])
        self.assertEqual(validate(account_contract()), [])
        self.assertTrue(any('page_structure_version' in message for message in
                            validate(account_contract(), require_page_structure=True)))

    def test_module_view_uses_current_data_order_and_owners(self):
        path = Path(__file__).resolve().parents[1] / 'examples' / 'booking-change.ui.json'
        view = check(path, module_id='M-requests')['module_view']
        self.assertEqual([f['id'] for f in view['function_logic']], ['F-request', 'F-review'])
        self.assertEqual([obj['id'] for obj in view['data_structure']['objects']], ['D-change'])
        customer = view['layout'][0]
        self.assertEqual([(s['position'], s['component_ids']) for s in customer['sections']],
                         [(1, ['C-state']), (2, ['C-open'])])
        self.assertEqual([j['id'] for j in view['flows']['journeys']], ['J-accept', 'J-reject'])
        booking = module_view(self.structured_contract(), 'M-booking')
        self.assertEqual(booking['interaction']['actions'], [])
        self.assertEqual(len(booking['flows']['journeys']), 2)
        with self.assertRaisesRegex(ValueError, 'unknown module'):
            check(path, module_id='missing')

    def test_module_data_and_journey_errors_name_the_missing_fact(self):
        data = self.structured_contract()
        model = data['modules'][1]['data_objects'][0]
        model['identity'] = '未列的字段'
        model['fields'][1]['reference'] = '另一个对象'
        del model['fields'][2]['type']
        data['journeys'][0]['module_ids'] = ['M-booking']
        messages = '\n'.join(validate(data))
        for issue in ('identity must name', 'unknown referenced data object', 'type, source and rule',
                      'include M-requests for action'):
            self.assertIn(issue, messages)

    def test_read_only_and_internal_modules_can_explain_absent_data_or_pages(self):
        data = self.structured_contract()
        data['modules'].append(dict(id='M-audit', name='结果核对', owner='运营', object='受理回执', outcome='确认一致',
                                    data_objects=[], data_note='仅读取预约和受理结果。', internal_flow='收到回执后比对，失败重查。'))
        data['features'].append(dict(id='F-audit', module_id='M-audit', need='核对结果', acceptance='复查一致',
                                     basis={'kind':'user', 'ref':'场景要求'}))
        data['non_ui_features'].append(dict(feature_id='F-audit', reason='收到回执时系统自动核对。'))
        self.assertEqual(validate(data, require_module_details=True), [])
        self.assertEqual(module_view(data, 'M-audit')['layout'], [])
        del data['modules'][-1]['data_note']
        del data['modules'][-1]['internal_flow']
        messages = '\n'.join(validate(data))
        self.assertIn('data_note', messages)
        self.assertIn('internal_flow', messages)

    def test_first_page_schema_still_accepts_an_existing_handoff(self):
        data = self.structured_contract()
        data['page_structure_version'] = 1
        for module in data['modules']:
            module.pop('data_objects')
        for journey in data['journeys']:
            journey.pop('module_ids')
        self.assertEqual(validate(data, require_page_structure=True), [])
        self.assertIn('page_structure_version 2', '\n'.join(validate(data, require_module_details=True)))

    def test_entry_reports_distinct_screens_and_actual_ordered_content(self):
        data = self.structured_contract()
        view = entry_view(data, 'E-customer-record')
        self.assertEqual(view['page_count'], 2)
        self.assertEqual([p['page_count'] for p in view['paths']], [1, 2, 2, 2])
        self.assertEqual(view['paths'][1]['visits'], ['P-booking', 'P-change', 'P-booking'])
        self.assertEqual(view['pages'][1]['title'], '选择新时段')
        self.assertEqual(view['pages'][1]['ordered_content'][2]['controls'], ['须门店确认后生效', '提交改期申请'])
        self.assertEqual(entry_view(data, 'E-store-queue')['page_count'], 1)
        self.assertEqual(entry_view(data, 'E-change')['paths'][2]['page_count'], 1)

    def test_entrance_rejects_wrong_origin_cross_role_and_false_back(self):
        data = self.structured_contract()
        customer, form, store = data['entries']
        customer['paths'][0]['steps'].append({'action_id':'A-accept', 'page_id':'P-booking'})
        customer['paths'][1]['steps'][0]['page_id'] = 'P-request'
        form['source_action_id'] = 'A-request'
        store['paths'][0]['steps'] = [{'back':True, 'page_id':'P-request'}]
        messages = '\n'.join(validate(data))
        for issue in ('does not belong to current page', 'cross-role page', 'source_action_id must open', 'previous page'):
            self.assertIn(issue, messages)

    def test_saved_form_is_removed_from_history_and_unreachable_page_fails(self):
        data = self.structured_contract()
        after_save = data['entries'][0]['paths'][1]['steps']
        after_save.append({'back':True,'page_id':'P-change'})
        self.assertIn('previous page', '\n'.join(validate(data)))
        data = self.structured_contract()
        data['entries'] = [data['entries'][2]]
        errors = '\n'.join(validate(data))
        self.assertIn('unreachable from declared entrances', errors)
        self.assertIn('navigation is absent from entrance paths', errors)

    def test_distinct_app_screens_can_share_one_route_and_same_screen_stays_one(self):
        data = self.structured_contract()
        detail, form = data['pages'][:2]
        form['route'] = detail['route']
        self.assertIn('duplicate route', '\n'.join(validate(data)))
        detail['view_key'], form['view_key'] = 'detail', 'select-time'
        self.assertEqual(validate(data), [])
        self.assertEqual(entry_view(data, 'E-customer-record')['page_count'], 2)
        self.assertEqual(entry_view(data, 'E-change')['paths'][2]['page_count'], 1)
        form['view_key'] = 'detail'
        self.assertIn('duplicate route', '\n'.join(validate(data)))

    def test_sections_cover_every_control_once_on_the_correct_page(self):
        data = self.structured_contract()
        sections = data['pages'][0]['sections']
        sections[1]['component_ids'] = ['C-time', 'C-accept']
        messages = '\n'.join(validate(data))
        for issue in ('occurs twice', 'unknown page component', 'has no section'):
            self.assertIn(issue, messages)

    def test_module_control_and_input_errors_are_reported(self):
        data = self.structured_contract()
        data['features'][0]['module_id'] = 'unknown'
        for component in data['components']:
            if component['kind'] == 'choice':
                del component['options']
                del component['validation']
            if component['id'] == 'C-submit':
                component['interaction'] = 'display'
            if component['id'] == 'C-state':
                component['interaction'] = 'action'
        messages = '\n'.join(validate(data))
        for issue in ('unknown business module_id', 'choice needs options', 'input needs validation',
                      'display component owns an action', 'interactive component has no action'):
            self.assertIn(issue, messages)

    def test_grouped_settings_and_separate_staff_action(self):
        self.assertEqual(validate(account_contract()), [])

    def test_scattered_action_and_wrong_shortcut_target(self):
        data = account_contract(); del data['actions'][0]['target_page_id']
        self.assertTrue(any('owner' in error for error in validate(data)))
        data['actions'][0]['target_page_id'] = 'staff'
        self.assertTrue(any('target_page_id' in error for error in validate(data)))

    def test_navigation_within_settings_can_open_the_edit_subpage(self):
        data = account_contract()
        settings = data["pages"][1]
        settings["feature_ids"].append("FN-1")
        data["components"][1]["feature_ids"].append("FN-1")
        data["actions"][1].update(feature_id="FN-1", target_page_id="edit-password")
        self.assertEqual(validate(data), [])

    def test_a_group_page_must_actually_offer_its_function(self):
        data = account_contract()
        data["action_groups"][0]["feature_ids"].append("FN-3")
        self.assertTrue(any("must expose" in error for error in validate(data)))

    def test_each_feature_has_one_group_and_known_rules(self):
        data = account_contract(); data['action_groups'][1]['feature_ids'].append('FN-1')
        self.assertTrue(any('multiple action groups' in e for e in validate(data)))
        data = account_contract(); data['actions'][3]['rule_refs'] = ['FN-1']
        self.assertEqual(validate(data), [])
        data['actions'][3]['rule_refs'] = ['missing']
        self.assertTrue(any('rule_refs' in e for e in validate(data)))

    def test_cycles_and_unscoped_actions(self):
        data = account_contract(); data['pages'][1]['parent_page_id'] = 'edit-password'
        self.assertTrue(any('cycle' in e for e in validate(data)))
        data = account_contract(); data['action_groups'].pop()
        self.assertTrue(any('no action group' in e for e in validate(data)))

    def test_legacy_contract_stays_readable(self):
        data = copy.deepcopy(account_contract()); data['schema'] = 'luz-ui-requirements/1'; del data['action_groups']
        for action in data['actions']: action.pop('feature_id'); action.pop('target_page_id', None)
        self.assertEqual(validate(data), [])
