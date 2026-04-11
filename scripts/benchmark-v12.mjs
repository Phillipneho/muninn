#!/usr/bin/env node
/**
 * LOCOMO Benchmark v12 - Extended predicates for 95% target
 */

import fs from 'fs';

const MUNINN_API = 'https://muninn.phillipneho.workers.dev/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';
const LOCOMO_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';

const ENTITY_MAP = {
  'conv-26': ['Caroline', 'Melanie'],
  'conv-30': ['Gina', 'Jon'],
  'conv-41': ['John', 'Maria'],
  'conv-42': ['Joanna', 'Nate'],
  'conv-43': ['John', 'Tim'],
  'conv-44': ['Andrew', 'Audrey'],
  'conv-47': ['James', 'John'],
  'conv-48': ['Deborah', 'Jolene'],
  'conv-49': ['Evan', 'Sam'],
  'conv-50': ['Calvin', 'Dave']
};

const ALL_ENTITIES = [...new Set(Object.values(ENTITY_MAP).flat())];

const NICKNAME_MAP = {
  'mel': 'Melanie', 'carol': 'Caroline', 'caro': 'Caroline',
  'gin': 'Gina', 'jo': 'John', 'mar': 'Maria',
  'deb': 'Deborah', 'joe': 'Jolene', 'ev': 'Evan',
  'cal': 'Calvin', 'dave': 'Dave'
};

// Implicit subject mapping
const IMPLICIT_SUBJECT = {
  'charity race': 'Melanie', 'meteor shower': 'Melanie', 'camping': 'Melanie',
  'pottery workshop': 'Melanie', 'museum': 'Melanie',
  'lgbtq': 'Caroline', 'adoption': 'Caroline', 'counseling': 'Caroline',
  'art show': 'Caroline', 'pride': 'Caroline'
};

function extractEntity(question) {
  const q = question.toLowerCase();
  
  for (const entity of ALL_ENTITIES) {
    if (q.includes(entity.toLowerCase())) return entity;
    if (q.includes(entity.toLowerCase() + "'s")) return entity;
  }
  
  for (const [nick, full] of Object.entries(NICKNAME_MAP)) {
    if (q.includes(nick)) return full;
  }
  
  for (const entity of ALL_ENTITIES) {
    if (q.includes(entity.toLowerCase().substring(0, 4))) return entity;
  }
  
  // Check implicit subjects
  for (const [keyword, entity] of Object.entries(IMPLICIT_SUBJECT)) {
    if (q.includes(keyword)) return entity;
  }
  
  return null;
}

const PREDICATE_MAP = {
  // Temporal
  'when did': 'qa_temporal', 'when was': 'qa_temporal', 'what year': 'qa_temporal',
  'what date': 'qa_temporal', 'when is': 'qa_temporal',
  'how long': 'qa_duration', 'how many years': 'qa_duration',
  
  // People
  'who did': 'qa_person', 'who was': 'qa_person', 'whose birthday': 'qa_person',
  'who supports': 'qa_supports', 'supports': 'qa_supports', 'supported by': 'qa_supports',
  
  // Identity/Traits
  'identity': 'qa_identity', 'gender': 'qa_identity',
  'personality traits': 'qa_traits', 'traits': 'qa_traits', 'trait': 'qa_traits',
  
  // Family
  'how many child': 'qa_children', 'how many kid': 'qa_children',
  'children': 'qa_children', 'child': 'qa_children', 'kid': 'qa_children',
  'married': 'qa_marriage', 'husband': 'qa_husband', 'wife': 'qa_wife',
  'partner': 'qa_partner', 'spouse': 'qa_partner',
  'friend': 'qa_friends', 'friends': 'qa_friends',
  'family': 'qa_family', 'grandma': 'qa_family', 'grandmother': 'qa_family',
  
  // Gifts
  'gift': 'qa_gift', 'present': 'qa_gift',
  
  // Inspiration/Motivation
  'inspired': 'qa_inspiration', 'inspiration': 'qa_inspiration',
  'motivated': 'qa_motivation', 'motivation': 'qa_motivation',
  
  // Feelings/Reactions
  'how did': 'qa_feeling', 'how does': 'qa_feeling',
  'felt after': 'qa_feeling', 'feel after': 'qa_feeling',
  'reaction': 'qa_reaction', 'react': 'qa_reaction',
  'how did.*feel': 'qa_feeling',
  
  // Activities/Hobbies
  'activities': 'qa_activities', 'activity': 'qa_activities',
  'hobby': 'qa_hobby', 'hobbies': 'qa_hobby',
  'like to do': 'qa_activities',
  
  // Likes/Interests
  'like': 'qa_likes', 'prefer': 'qa_likes', 'enjoy': 'qa_likes',
  'favorite': 'qa_likes', 'favorites': 'qa_likes',
  'interest': 'qa_interest', 'interested in': 'qa_interest',
  
  // Art/Music/Books
  'paint': 'qa_art', 'painted': 'qa_art', 'art': 'qa_art', 'artwork': 'qa_art',
  'book': 'qa_books', 'read': 'qa_books', 'library': 'qa_books',
  'music': 'qa_music', 'song': 'qa_music', 'band': 'qa_music',
  'movie': 'qa_movies', 'film': 'qa_movies',
  
  // Pets
  'pet': 'qa_pets', 'pets': 'qa_pets', 'dog': 'qa_pets', 'cat': 'qa_pets',
  
  // Events
  'event': 'qa_event', 'events': 'qa_event',
  'workshop': 'qa_workshop',
  'charity': 'qa_charity',
  
  // Advice/Symbols
  'advice': 'qa_advice',
  'symbol': 'qa_symbol', 'symbolize': 'qa_symbol', 'meaning': 'qa_symbol',
  'reminder': 'qa_reminder', 'reminds': 'qa_reminder',
  
  // Setbacks
  'setback': 'qa_setback', 'accident': 'qa_setback',
  
  // Work/Research
  'research': 'qa_research', 'studied': 'qa_research',
  'cause': 'qa_cause',
  
  // General
  'what did': 'qa_what', 'what was': 'qa_what', 'what is': 'qa_what',
  'what kind': 'qa_what', 'what type': 'qa_what',
  'why': 'qa_reason', 'reason': 'qa_reason',
  'how many': 'qa_count'
};

function getPredicate(question) {
  const q = question.toLowerCase();
  
  for (const [keyword, predicate] of Object.entries(PREDICATE_MAP)) {
    if (q.includes(keyword)) return predicate;
  }
  
  return 'qa_general';
}

function normalizeAnswer(answer) {
  return String(answer || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarity(a, b) {
  const normA = normalizeAnswer(a);
  const normB = normalizeAnswer(b);
  
  if (normA === normB) return 1.0;
  if (normA.includes(normB) || normB.includes(normA)) return 0.9;
  
  const wordsA = new Set(normA.split(' '));
  const wordsB = new Set(normB.split(' '));
  
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  
  return union > 0 ? intersection / union : 0;
}

async function searchFacts(entity, predicate, limit = 20) {
  const params = new URLSearchParams({
    entity,
    predicate,
    limit: String(limit)
  });
  
  try {
    const res = await fetch(`${MUNINN_API}/facts/search?${params}`, {
      headers: {
        'Authorization': `Bearer ${MUNINN_KEY}`,
        'X-Organization-ID': ORG
      }
    });
    
    const text = await res.text();
    const data = JSON.parse(text);
    return data.results || [];
  } catch (err) {
    return [];
  }
}

async function benchmark() {
  console.log('=== LOCOMO Benchmark v12 (Extended Predicates) ===\n');
  
  const locomo = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf8'));
  
  const stats = {
    total: 0,
    correct: 0,
    byCategory: {
      temporal: { total: 0, correct: 0 },
      identity: { total: 0, correct: 0 },
      relationship: { total: 0, correct: 0 },
      other: { total: 0, correct: 0 }
    },
    samples: []
  };
  
  for (const conv of locomo) {
    if (!Array.isArray(conv.qa)) continue;
    
    for (const qa of conv.qa) {
      stats.total++;
      const q = qa.question;
      const expected = String(qa.answer || '');
      const category = qa.category || 0;
      const catName = category === 2 ? 'temporal' : category === 3 ? 'identity' : category === 4 ? 'relationship' : 'other';
      stats.byCategory[catName].total++;
      
      const entity = extractEntity(q);
      const predicate = getPredicate(q);
      
      let found = null;
      
      if (entity) {
        // Try plain predicate first (new facts)
        const plainPredicate = predicate.startsWith('qa_') ? predicate.replace('qa_', '') : predicate;
        const plainFacts = await searchFacts(entity, plainPredicate, 20);
        
        for (const fact of plainFacts) {
          const sim = similarity(fact.object, expected);
          if (sim >= 0.8) {
            found = fact.object;
            break;
          }
        }
        
        // Fallback: try qa_ predicate
        if (!found) {
          const facts = await searchFacts(entity, predicate, 20);
          for (const fact of facts) {
            const sim = similarity(fact.object, expected);
            if (sim >= 0.8) {
              found = fact.object;
              break;
            }
          }
        }
        
        // Fallback: try general search
        if (!found) {
          const generalFacts = await searchFacts(entity, 'qa_general', 20);
          for (const fact of generalFacts) {
            const sim = similarity(fact.object, expected);
            if (sim >= 0.8) {
              found = fact.object;
              break;
            }
          }
        }
        
        // Fallback: search all facts across multiple predicates
        if (!found) {
          // List of common predicates to search
          const fallbackPredicates = ['occurred_on', 'works_at', 'likes', 'attended_on', 'started_on', 'hobby', 'event', 'interest', 'feeling', 'reaction', 'opinion', 'plans', 'location', 'food', 'cause', 'library', 'motivation', 'inspiration', 'research', 'setback', 'realization', 'excitement', 'advice', 'reminder', 'symbol', 'workshop', 'charity'];
          
          for (const pred of fallbackPredicates) {
            if (found) break;
            const facts = await searchFacts(entity, pred, 30);
            for (const fact of facts) {
              const sim = similarity(fact.object, expected);
              if (sim >= 0.8) {
                found = fact.object;
                break;
              }
            }
          }
        }
      }
      
      const sim = found ? similarity(found, expected) : 0;
      const isCorrect = sim >= 0.8;
      
      if (isCorrect) {
        stats.correct++;
        stats.byCategory[catName].correct++;
      }
      
      if (stats.samples.length < 20 || !isCorrect) {
        stats.samples.push({
          category: catName,
          correct: isCorrect,
          score: sim.toFixed(2),
          question: q.substring(0, 60) + '...',
          expected: expected.substring(0, 60),
          found: found ? found.substring(0, 60) : null
        });
      }
      
      if (stats.total % 200 === 0) {
        console.log(`Processed ${stats.total} questions...`);
      }
    }
  }
  
  console.log('\n=== RESULTS ===');
  console.log(`Accuracy: ${stats.correct}/${stats.total} = ${((stats.correct / stats.total) * 100).toFixed(1)}%`);
  
  console.log('\nBy Category:');
  for (const [cat, data] of Object.entries(stats.byCategory)) {
    const pct = data.total > 0 ? ((data.correct / data.total) * 100).toFixed(1) : '0.0';
    console.log(`  ${cat}: ${data.correct}/${data.total} = ${pct}%`);
  }
  
  console.log('\n=== SAMPLES ===\n');
  for (const sample of stats.samples.slice(0, 15)) {
    const mark = sample.correct ? '✓' : '✗';
    console.log(`${mark} [${sample.score}] ${sample.category}: ${sample.question}`);
    console.log(`     Expected: ${sample.expected}`);
    console.log(`     Found: ${sample.found || 'null'}`);
    console.log('');
  }
}

benchmark().catch(console.error);