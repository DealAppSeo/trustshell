from setuptools import setup, find_packages

setup(
    name="hyperdag-trustshell",
    version="0.3.0",
    description="TrustShell Python SDK - HAL trust scoring for AI responses",
    packages=find_packages(),
    install_requires=["httpx>=0.24.0"],
    python_requires=">=3.8",
)
