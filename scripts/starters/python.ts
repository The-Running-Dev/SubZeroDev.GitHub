// Writes the Python starter files: setuptools, pytest, black, pylint, mypy and flake8.

import { writeProjectFile } from '../lib/files.ts';
import type { Log } from '../lib/log.ts';

export function pythonStarter(log: Log, projectPath: string, projectName: string): void {
  const write = (relativePath: string, content: string) => writeProjectFile(projectPath, relativePath, content, { force: true });
  log.step('Setting up Python starter files');

  const packageName = projectName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();

  write('requirements.txt', `# Production dependencies
# Add packages here as: package-name==version

# Development dependencies (optional)
# Run: pip install -r requirements-dev.txt`);

  write('requirements-dev.txt', `# Development and testing dependencies
-r requirements.txt

pytest==7.4.0
pytest-cov==4.1.0
black==23.7.0
pylint==2.17.5
mypy==1.4.1
flake8==6.0.0`);

  write('setup.py', `from setuptools import setup, find_packages

with open('README.md', 'r', encoding='utf-8') as f:
    long_description = f.read()

setup(
    name='${packageName}',
    version='0.1.0',
    description='${projectName}',
    long_description=long_description,
    long_description_content_type='text/markdown',
    packages=find_packages(where='src'),
    package_dir={'': 'src'},
    python_requires='>=3.8',
    install_requires=[],
    extras_require={
        'dev': [
            'pytest',
            'pytest-cov',
            'black',
            'pylint',
            'mypy',
            'flake8',
        ],
    },
)`);

  write('pyproject.toml', `[build-system]
requires = ["setuptools>=61.0", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "${packageName}"
version = "0.1.0"
description = "${projectName}"
requires-python = ">=3.8"

[tool.black]
line-length = 100
target-version = ['py38', 'py39', 'py310', 'py311']

[tool.pylint]
max-line-length = 100
disable = []

[tool.mypy]
python_version = "3.8"
warn_return_any = true
warn_unused_configs = true
disallow_untyped_defs = false`);

  write('pytest.ini', `[pytest]
testpaths = tests
python_files = test_*.py *_test.py
python_classes = Test*
python_functions = test_*
addopts = --verbose --cov=src --cov-report=term-missing`);

  write('.flake8', `[flake8]
max-line-length = 100
extend-ignore = E203, W503
exclude = .venv,venv,build,dist,.git`);

  write('src/__init__.py', `"""
${projectName} package
"""

__version__ = "0.1.0"`);

  write('src/main.py', `"""
Main application entry point
"""


def main():
    print("Welcome to ${projectName}")


if __name__ == "__main__":
    main()`);

  write('tests/__init__.py', '');

  write('tests/test_main.py', `def test_example():
    assert True`);

  log.success('Python starter files written');
}
