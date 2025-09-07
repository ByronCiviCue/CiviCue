import type { Rule } from 'eslint';

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow direct access to process.env outside of src/lib/env.ts',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      processEnvAccess: 'Direct access to process.env is not allowed outside of src/lib/env.ts. Import environment variables from src/lib/env.ts instead.',
    },
    schema: [], // No options
  },

  create(context: Rule.RuleContext) {
    const filename = context.getFilename();
    const isEnvFile = filename.endsWith('src/lib/env.ts') || filename.endsWith('src\\lib\\env.ts');

    // If we're in the allowed file, don't report anything
    if (isEnvFile) {
      return {};
    }

    function isProcessEnvAccess(node: any): boolean {
      const { object, property, computed } = node;

      // Check for process.env pattern
      if (object.type === 'Identifier' && object.name === 'process') {
        if (computed) {
          // process['env'] or process["env"]
          return property.type === 'Literal' && property.value === 'env';
        } else {
          // process.env
          return property.type === 'Identifier' && property.name === 'env';
        }
      }

      return false;
    }

    function checkDestructuring(node: any): void {
      if (node.id.type === 'ObjectPattern' && node.init?.type === 'MemberExpression') {
        const memberExpr = node.init;
        if (isProcessEnvAccess(memberExpr)) {
          context.report({
            node: node.init,
            messageId: 'processEnvAccess',
          });
        }
      }
    }

    return {
      MemberExpression(node: any) {
        if (isProcessEnvAccess(node)) {
          context.report({
            node,
            messageId: 'processEnvAccess',
          });
        }
      },

      VariableDeclarator(node: any) {
        checkDestructuring(node);
      },
    };
  },
};

export default rule;