"""Muninn SDK - Python client for the Muninn memory API."""

from muninn.client import MuninnClient

__version__ = "2.0.0"
__all__ = ["MuninnClient", "MuninnMemory", "MuninnEntityMemory", "MuninnChatMemory", "MuninnVectorMemory", "MuninnKnowledgeGraphMemory"]

# Lazy imports for LangChain/LlamaIndex integrations
def __getattr__(name: str):
    """Lazy import for optional integrations."""
    if name == "MuninnMemory":
        from muninn.langchain import MuninnMemory
        return MuninnMemory
    elif name == "MuninnEntityMemory":
        from muninn.langchain import MuninnEntityMemory
        return MuninnEntityMemory
    elif name == "MuninnChatMemory":
        from muninn.llamaindex import MuninnChatMemory
        return MuninnChatMemory
    elif name == "MuninnVectorMemory":
        from muninn.llamaindex import MuninnVectorMemory
        return MuninnVectorMemory
    elif name == "MuninnKnowledgeGraphMemory":
        from muninn.llamaindex import MuninnKnowledgeGraphMemory
        return MuninnKnowledgeGraphMemory
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")