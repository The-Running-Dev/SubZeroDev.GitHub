import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

/**
 * Local Docusaurus config — overrides the template's default: the docs workflow
 * (GitHub-ActionTemplates docs.yml) overlays this directory on its bundled
 * template, and ./Dockerfile overlays it on the docs-template image for local
 * preview. Content lives in ./docs; the sidebar is ./sidebar.ts.
 *
 * The docs workflow sets DOCS_URL and DOCS_BASE_URL from the repository's Pages
 * settings when it deploys; without them (pull requests, local preview) the
 * site is built for the root of https://example.com.
 *
 * Placeholder title/url/tagline — edit to taste. Broken-link checks are 'warn'
 * (not 'throw') to keep authoring frictionless; flip to 'throw' to gate builds.
 */
const config: Config = {
  title: 'SubZeroDev.GitHub',
  tagline: 'Every The-Running-Dev GitHub repository, defined once in OpenTofu, and the scripts that scaffold and publish new projects.',
  url: process.env.DOCS_URL || 'https://example.com',
  baseUrl: `/${process.env.DOCS_BASE_URL ?? ''}/`.replace(/\/{2,}/g, '/'),
  onBrokenLinks: 'warn',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn'
    }
  },
  i18n: { defaultLocale: 'en', locales: ['en'] },
  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebar.ts',
          routeBasePath: '/'
        },
        blog: false
      } satisfies Preset.Options
    ]
  ],

  themeConfig: {
    navbar: {
      title: 'SubZeroDev.GitHub',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docs',
          position: 'left',
          label: 'Docs'
        }
      ]
    },
    footer: { style: 'dark', links: [] }
  } satisfies Preset.ThemeConfig
};

export default config;
