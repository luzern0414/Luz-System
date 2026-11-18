// Only the two in-memory admin prototypes use these fictitious accounts. A reload resets them.
(() => {
  const roles = new Map([['admin', 'A'], ['front1', 'F']]);
  const passwords = new Map();
  function reset() { for (const role of roles.values()) passwords.set(role, 'Admin@2026'); }
  function roleFor(user, password) {
    const role = roles.get(user.trim());
    return role && passwords.get(role) === password ? role : null;
  }
  function change(role, old, next) {
    if (!passwords.has(role) || passwords.get(role) !== old) return '原密码不正确';
    if (!next || next === old) return '请输入与原密码不同的新密码';
    passwords.set(role, next);
    return '';
  }
  reset();
  globalThis.LuzDemoAccount = { roleFor, change, reset };
})();
