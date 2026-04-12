"""
LlamaIndex integration for Muninn memory system.

Provides memory classes for LlamaIndex agents to persist
conversation history and knowledge across sessions.
"""

from typing import Any, Dict, List, Optional, Sequence
from llama_index.core.memory import BaseMemory
from llama_index.core.llms import ChatMessage, MessageRole
from .client import MuninnClient


class MuninnChatMemory(BaseMemory):
    """
    LlamaIndex chat memory backed by Muninn.
    
    Usage:
        from muninn.llamaindex import MuninnChatMemory
        from llama_index.core.agent import AgentRunner
        
        memory = MuninnChatMemory(
            api_key="muninn_xxx",
            organization_id="my-agent"
        )
        
        agent = AgentRunner.from_llm(
            llm=llm,
            memory=memory
        )
    """
    
    def __init__(
        self,
        api_key: str,
        organization_id: str = "default",
        base_url: str = "https://api.muninn.au",
        token_limit: int = 3000,
        **kwargs
    ):
        """Initialize Muninn chat memory for LlamaIndex."""
        super().__init__(**kwargs)
        self._client = MuninnClient(
            api_key=api_key,
            organization_id=organization_id,
            base_url=base_url
        )
        self._token_limit = token_limit
    
    @classmethod
    def class_name(cls) -> str:
        return "MuninnChatMemory"
    
    def get(self, input: Optional[str] = None, **kwargs) -> List[ChatMessage]:
        """Get chat history from Muninn."""
        query = input or ""
        
        # Search for relevant memories
        memories = self._client.search(
            query=query,
            limit=20
        )
        
        # Convert to ChatMessage format
        messages = []
        for memory in memories:
            content = memory.get("content", "")
            metadata = memory.get("metadata", {})
            role = metadata.get("role", "user")
            
            msg_role = MessageRole.USER if role == "user" else MessageRole.ASSISTANT
            messages.append(ChatMessage(
                role=msg_role,
                content=content,
                additional_kwargs={"memory_id": memory.get("id")}
            ))
        
        return messages
    
    def get_all(self) -> List[ChatMessage]:
        """Get all chat history."""
        return self.get(input="")
    
    def put(self, message: ChatMessage) -> None:
        """Store a message in Muninn."""
        role = "user" if message.role == MessageRole.USER else "assistant"
        
        self._client.store(
            content=message.content,
            memory_type="conversational",
            metadata={
                "role": role,
                "source": "llamaindex"
            }
        )
    
    def set(self, messages: Sequence[ChatMessage]) -> None:
        """Replace all messages (not recommended for Muninn)."""
        # Clear and re-add (Muninn doesn't support bulk replace)
        for message in messages:
            self.put(message)
    
    def reset(self) -> None:
        """Reset memory (not implemented for safety)."""
        pass


class MuninnVectorMemory:
    """
    Vector-based memory for LlamaIndex using Muninn.
    
    Provides semantic search over stored memories.
    Best for RAG applications where you need to find
    relevant context from past conversations.
    
    Usage:
        from muninn.llamaindex import MuninnVectorMemory
        
        memory = MuninnVectorMemory(
            api_key="muninn_xxx",
            organization_id="my-agent"
        )
        
        # Retrieve relevant context
        context = memory.retrieve("user preferences about React")
    """
    
    def __init__(
        self,
        api_key: str,
        organization_id: str = "default",
        base_url: str = "https://api.muninn.au",
        similarity_threshold: float = 0.7,
        **kwargs
    ):
        """Initialize vector memory."""
        self._client = MuninnClient(
            api_key=api_key,
            organization_id=organization_id,
            base_url=base_url
        )
        self._similarity_threshold = similarity_threshold
    
    def add(self, content: str, metadata: Optional[Dict[str, Any]] = None) -> str:
        """Add content to memory."""
        result = self._client.store(
            content=content,
            memory_type="semantic",
            metadata=metadata or {}
        )
        return result.get("id", "")
    
    def retrieve(
        self,
        query: str,
        limit: int = 10,
        **kwargs
    ) -> List[Dict[str, Any]]:
        """Retrieve semantically similar memories."""
        results = self._client.search(
            query=query,
            limit=limit,
            search_type="hybrid"  # Uses both keyword and vector search
        )
        
        # Filter by similarity threshold
        filtered = []
        for result in results:
            similarity = result.get("score", 1.0)
            if similarity >= self._similarity_threshold:
                filtered.append({
                    "content": result.get("content"),
                    "score": similarity,
                    "metadata": result.get("metadata", {}),
                    "id": result.get("id")
                })
        
        return filtered
    
    def delete(self, memory_id: str) -> bool:
        """Delete a memory by ID."""
        try:
            self._client.delete(memory_id)
            return True
        except Exception:
            return False
    
    def clear(self) -> None:
        """Clear all memories (not implemented for safety)."""
        pass


class MuninnKnowledgeGraphMemory:
    """
    Knowledge graph memory for LlamaIndex.
    
    Stores and retrieves facts as entity-relationship triples.
    Best for agents that need structured knowledge about
    entities and their relationships.
    
    Usage:
        from muninn.llamaindex import MuninnKnowledgeGraphMemory
        
        memory = MuninnKnowledgeGraphMemory(
            api_key="muninn_xxx"
        )
        
        # Query entity relationships
        facts = memory.get_entity_facts("James")
        # Returns: [{"predicate": "works_at", "object": "TechCorp"}, ...]
    """
    
    def __init__(
        self,
        api_key: str,
        organization_id: str = "default",
        base_url: str = "https://api.muninn.au",
        **kwargs
    ):
        """Initialize knowledge graph memory."""
        self._client = MuninnClient(
            api_key=api_key,
            organization_id=organization_id,
            base_url=base_url
        )
    
    def get_entity_facts(
        self,
        entity_name: str,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Get all facts about an entity."""
        try:
            facts = self._client.get_entity_facts(entity_name)
            return facts[:limit]
        except Exception:
            return []
    
    def query_relation(
        self,
        subject: str,
        predicate: str
    ) -> List[Dict[str, Any]]:
        """Query for specific subject-predicate combinations."""
        try:
            results = self._client.search_facts(
                query=f"{subject} {predicate}",
                limit=10
            )
            return [
                r for r in results
                if r.get("subject") == subject and r.get("predicate") == predicate
            ]
        except Exception:
            return []
    
    def add_fact(
        self,
        subject: str,
        predicate: str,
        obj: str,
        confidence: float = 1.0
    ) -> str:
        """Add a fact to the knowledge graph."""
        result = self._client.store(
            content=f"{subject} {predicate} {obj}",
            memory_type="semantic",
            metadata={
                "subject": subject,
                "predicate": predicate,
                "object": obj,
                "confidence": confidence
            }
        )
        return result.get("id", "")