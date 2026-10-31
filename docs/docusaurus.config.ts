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
 * Broken links fail the build, so the docs workflow catches a link between pages
 * that build/Test-Documentation.ps1 does not check.
 */
const repository = 'https://github.com/The-Running-Dev/SubZeroDev.GitHub';

const config: Config = {
  title: 'SubZeroDev.GitHub',
  tagline: 'Every The-Running-Dev GitHub repository, defined once in OpenTofu, and the scripts that scaffold and publish new projects.',
  url: process.env.DOCS_URL || 'https://example.com',
  baseUrl: `/${process.env.DOCS_BASE_URL ?? ''}/`.replace(/\/{2,}/g, '/'),
  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'throw'
    }
  },
  i18n: { defaultLocale: 'en', locales: ['en'] },
  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebar.ts',
          routeBasePath: '/',
          // index.md is generated from README.md, so its edits belong there.
          editUrl: ({ docPath }) =>
            docPath === 'index.md' ? `${repository}/edit/main/README.md` : `${repository}/edit/main/docs/docs/${docPath}`
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
        },
        {
          href: repository,
          label: 'GitHub',
          position: 'right'
        }
      ]
    },
    footer: {
      style: 'dark',
      links: [
        { label: 'Repository', href: repository },
        { label: 'Issues', href: `${repository}/issues` },
        { label: 'Pull requests', href: `${repository}/pulls` }
      ]
    }
  } satisfies Preset.ThemeConfig
};

export default config;
