#Requires -Version 7.0
<#
.SYNOPSIS
    Writes the Python starter files. Run by Invoke-LanguageStarter for -Language python.
#>
param(
    [Parameter(Mandatory)][string]$ProjectPath,
    [Parameter(Mandatory)][string]$ProjectName
)

Import-Module (Join-Path $PSScriptRoot '../modules/Project.psm1') -Force

Write-Step 'Setting up Python starter files'

$projectNameSnake = ($ProjectName -replace '[^a-zA-Z0-9]', '_').ToLower()

New-ProjectFile -ProjectPath $ProjectPath -RelativePath 'requirements.txt' -Force -Content @'
# Production dependencies
# Add packages here as: package-name==version

# Development dependencies (optional)
# Run: pip install -r requirements-dev.txt
'@

New-ProjectFile -ProjectPath $ProjectPath -RelativePath 'requirements-dev.txt' -Force -Content @'
# Development and testing dependencies
-r requirements.txt

pytest==7.4.0
pytest-cov==4.1.0
black==23.7.0
pylint==2.17.5
mypy==1.4.1
flake8==6.0.0
'@

New-ProjectFile -ProjectPath $ProjectPath -RelativePath 'setup.py' -Force -Content @"
from setuptools import setup, find_packages

with open('README.md', 'r', encoding='utf-8') as f:
    long_description = f.read()

setup(
    name='$projectNameSnake',
    version='0.1.0',
    description='$ProjectName',
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
)
"@

New-ProjectFile -ProjectPath $ProjectPath -RelativePath 'pyproject.toml' -Force -Content @"
[build-system]
requires = ["setuptools>=61.0", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "$projectNameSnake"
version = "0.1.0"
description = "$ProjectName"
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
disallow_untyped_defs = false
"@

New-ProjectFile -ProjectPath $ProjectPath -RelativePath 'pytest.ini' -Force -Content @'
[pytest]
testpaths = tests
python_files = test_*.py *_test.py
python_classes = Test*
python_functions = test_*
addopts = --verbose --cov=src --cov-report=term-missing
'@

New-ProjectFile -ProjectPath $ProjectPath -RelativePath '.flake8' -Force -Content @'
[flake8]
max-line-length = 100
extend-ignore = E203, W503
exclude = .venv,venv,build,dist,.git
'@

New-ProjectFile -ProjectPath $ProjectPath -RelativePath 'src/__init__.py' -Force -Content @"
"""
$ProjectName package
"""

__version__ = "0.1.0"
"@

New-ProjectFile -ProjectPath $ProjectPath -RelativePath 'src/main.py' -Force -Content @"
"""
Main application entry point
"""


def main():
    print("Welcome to $ProjectName")


if __name__ == "__main__":
    main()
"@

New-ProjectFile -ProjectPath $ProjectPath -RelativePath 'tests/__init__.py' -Force -Content ''

New-ProjectFile -ProjectPath $ProjectPath -RelativePath 'tests/test_main.py' -Force -Content @'
def test_example():
    assert True
'@

Write-Success 'Python starter files written'
