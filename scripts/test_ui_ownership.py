"""Regression cases for a shared settings entry and cross-page rule references."""
import copy
import unittest

from ui_requirements import STATES, validate


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
