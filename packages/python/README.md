# Muninn SDK (Python)

Python SDK for **Muninn** — Agent memory system with **99.1% LOCOMO accuracy**.

## Installation

```bash
pip install muninn-sdk
```

## Quick Start

```python
from muninn import MuninnClient

client = MuninnClient(api_key="muninn_xxx")  # Get from https://muninn.au/dashboard

# Store a memory
client.store("James works at TechCorp as a Senior Engineer")

# Search memories
results = client.search("James workplace")
print(results)
# [{'id': '...', 'content': 'James works at TechCorp...', 'score': 0.95}]
```

## API

### `store(content, memory_type='semantic', metadata=None, entities=None)`

Store a memory in Muninn.

```python
client.store(
    "Content to remember",
    memory_type="semantic",  # semantic, episodic, procedural
    metadata={"source": "conversation"}
)
```

### `search(query, limit=10, search_type='hybrid')`

Search memories using hybrid search (keyword + semantic).

```python
results = client.search("James workplace", limit=10, search_type="hybrid")
```

### `list(limit=50)`

List all memories.

```python
memories = client.list(limit=50)
```

### `delete(memory_id)`

Delete a memory by ID.

```python
client.delete("memory_id_here")
```

### `get_entity_facts(entity_name)`

Get all facts about an entity.

```python
facts = client.get_entity_facts("James")
# [{'predicate': 'works_at', 'object': 'TechCorp', 'confidence': 0.95}]
```

## Integration Examples

### LangChain

```python
from muninn.langchain import MuninnMemory, MuninnEntityMemory
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
```

### LlamaIndex

```python
from muninn.llamaindex import MuninnChatMemory, MuninnVectorMemory
from llama_index.core.agent import AgentRunner

memory = MuninnChatMemory(
    api_key="muninn_xxx",
    organization_id="my-agent"
)

agent = AgentRunner.from_llm(llm=llm, memory=memory)
```

### Custom Agent

```python
class MyAgent:
    def __init__(self, api_key: str):
        self.memory = MuninnClient(api_key)
    
    def chat(self, message: str) -> str:
        # Retrieve relevant context
        context = self.memory.search(message)
        
        # Generate response with context
        response = self.llm.generate(
            prompt=message,
            context=[m['content'] for m in context]
        )
        
        # Store the conversation
        self.memory.store(f"User: {message}\nAgent: {response}")
        
        return response
```

## Links

- **Documentation**: https://clawhub.ai/skill/muninn-skill
- **Dashboard**: https://muninn.au
- **GitHub**: https://github.com/Phillipneho/muninn

## License

MIT