// Exemplo de código Rust
use std::collections::HashMap;

pub struct Cache<K, V> {
    storage: HashMap<K, V>,
}

impl<K: std::hash::Hash + Eq, V: Clone> Cache<K, V> {
    pub fn new() -> Self {
        Cache {
            storage: HashMap::new(),
        }
    }

    pub fn insert(&mut self, key: K, value: V) {
        self.storage.insert(key, value);
    }

    pub fn get(&self, key: &K) -> Option<V> {
        self.storage.get(key).cloned()
    }
}

fn main() {
    let mut cache = Cache::new();
    cache.insert("status", "ativo");
    println!("Cache: {:?}", cache.get(&"status"));
}
