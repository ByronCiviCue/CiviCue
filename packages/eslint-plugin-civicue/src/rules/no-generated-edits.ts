import type { Rule } from 'eslint';

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow any edits to files under src/generated/**',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      generatedFileEdit: 'Files under src/generated/** are auto-generated and should not be manually edited. Make changes to the source templates or generators instead.',
    },
    schema: [], // No options
  },

  create(context: Rule.RuleContext) {
    const filename = context.getFilename();
    const isGeneratedFile = filename.includes('src/generated/') || filename.includes('src\\generated\\');

    // If this file is under src/generated/**, report an error
    if (isGeneratedFile) {
      return {
        Program(node: any) {
          context.report({
            node,
            messageId: 'generatedFileEdit',
          });
        },
      };
    }

    // For files not under src/generated/**, no rules apply
    return {};
  },
};

export default rule;