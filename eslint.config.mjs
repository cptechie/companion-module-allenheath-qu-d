import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'

const baseConfig = await generateEslintConfig({
	enableTypescript: true,
})

export default [
	...baseConfig,
	{
		// Tests run from the repository and may import dev dependencies
		files: ['src/**/__tests__/**/*'],
		rules: {
			'n/no-unpublished-import': 'off',
		},
	},
]
