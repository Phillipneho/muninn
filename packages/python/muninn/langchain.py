"""
LangChain integration for Muninn memory system.

Provides a memory class that can be used with LangChain agents
to persist conversation history and entity knowledge across sessions.
"""

from typing import Any, Dict, List, Optional
from langchain.schema import BaseMemory, BaseMessage, HumanMessage, AIMessage
from .client import MuninnClient


class MuninnMemory(BaseMemory):
    """
    LangChain memory backed by Muninn.
    
    Usage:
        from muninn.langchain import MuninnMemory
        from langchain.agents import initialize_agent
        
        memory = MuninnMemory(
            api_key="muninn_xxx",
            organization_id="my-agent"
        )
        
        agent = initialize_agent(
            tools=tools,
            llm=llm,
            memory=memory,
            agent="zero-shot-react-description"
        )
    """
    
    def __init__(
        self,
        api_key: str,
        organization_id: str = "default",
        base_url: str = "https://api.muninn.au",
        memory_type: str = "conversational",
        **kwargs
    ):
        """Initialize Muninn memory for LangChain."""
        super().__init__(**kwargs)
        self._client = MuninnClient(
            api_key=api_key,
            organization_id=organization_id,
            base_url=base_url
        )
        self._memory_type = memory_type
    
    @property
    def memory_variables(self) -> List[str]:
        """Return memory variables."""
        return ["history", "entities"]
    
    def load_memory_variables(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """Load memory from Muninn."""
        # Get recent memories
        memories = self._client.search(
            query=str(inputs),
            limit=10
        )
        
        # Format as conversation history
        history = []
        entities = set()
        
        for memory in memories:
            content = memory.get("content", "")
            metadata = memory.get("metadata", {})
            
            # Extract role if available
            role = metadata.get("role", "user")
            if role == "user":
                history.append(HumanMessage(content=content))
            else:
                history.append(AIMessage(content=content))
            
            # Track entities
            for entity in memory.get("entities", []):
                entities.add(entity)
        
        return {
            "history": history,
            "entities": list(entities)
        }
    
    def save_context(self, inputs: Dict[str, Any], outputs: Dict[str, str]) -> None:
        """Save conversation turn to Muninn."""
        # Save user input
        user_input = str(inputs)
        if user_input:
            self._client.store(
                content=user_input,
                memory_type=self._memory_type,
                metadata={"role": "user", "source": "langchain"}
            )
        
        # Save AI output
        ai_output = outputs.get("output", str(outputs))
        if ai_output:
            self._client.store(
                content=ai_output,
                memory_type=self._memory_type,
                metadata={"role": "assistant", "source": "langchain"}
            )
    
    def clear(self) -> None:
        """Clear memory (not implemented for safety)."""
        pass  # Intentional - we don't want to delete memories


class MuninnEntityMemory(BaseMemory):
    """
    Entity-focused memory for LangChain.
    
    Stores and retrieves facts about entities mentioned in conversation.
    Best for agents that need to remember specific information about
    people, organizations, or concepts.
    
    Usage:
        from muninn.langchain import MuninnEntityMemory
        
        memory = MuninnEntityMemory(
            api_key="muninn_xxx",
            organization_id="my-agent"
        )
    """
    
    def __init__(
        self,
        api_key: str,
        organization_id: str = "default",
        base_url: str = "https://api.muninn.au",
        **kwargs
    ):
        """Initialize entity memory."""
        super().__init__(**kwargs)
        self._client = MuninnClient(
            api_key=api_key,
            organization_id=organization_id,
            base_url=base_url
        )
    
    @property
    def memory_variables(self) -> List[str]:
        return ["entity_facts"]
    
    def load_memory_variables(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """Load facts about entities mentioned in inputs."""
        input_str = str(inputs)
        
        # Search for facts
        facts = self._client.search_facts(
            query=input_str,
            limit=20
        )
        
        # Group by entity
        entity_facts = {}
        for fact in facts:
            subject = fact.get("subject", "unknown")
            if subject not in entity_facts:
                entity_facts[subject] = []
            entity_facts[subject].append({
                "predicate": fact.get("predicate"),
                "object": fact.get("object"),
                "confidence": fact.get("confidence", 1.0)
            })
        
        return {"entity_facts": entity_facts}
    
    def save_context(self, inputs: Dict[str, Any], outputs: Dict[str, str]) -> None:
        """Extract and store entities from conversation."""
        # Muninn's extraction will handle this via the API
        combined = f"User: {inputs}\nAssistant: {outputs}"
        self._client.store(
            content=combined,
            memory_type="conversational",
            metadata={"source": "langchain_entity"}
        )
    
    def clear(self) -> None:
        pass