module.exports = [
  {
    ignores: ["node_modules/**", "data/**", "backups/**", "logs/**"]
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script"
    },
    rules: {
      "no-unused-vars": "off",
      "no-undef": "off"
    }
  }
];
