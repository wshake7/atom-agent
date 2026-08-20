// Root commitlint config for the monorepo workspace.
// Without this, commitlint 19+ reports [empty-rules] even on well-formed
// conventional messages; it no longer auto-loads @commitlint/config-conventional.
export default {
  extends: ['@commitlint/config-conventional'],
};
