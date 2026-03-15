export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // 필요한 경우 규칙 커스텀
    'type-enum': [2, 'always', ['feat', 'fix', 'style', 'refactor', 'chore']],
  },
};
