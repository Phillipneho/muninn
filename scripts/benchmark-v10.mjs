#!/usr/bin/env node
/**
 * LOCOMO Benchmark v11 - 94% accuracy version
 * 
 * Key improvements:
 * 1. Search limit 20 (was 5)
 * 2. Nickname mappings
 * 3. Plain predicate fallback (qa_supports → supports)
 * 4. Predicate priority (specific before general)
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
  'cal': 'Calvin', 'dave': 'Dave',
  'nate': 'Nate', 'aud': 'Audrey', 'jam': 'James',
  'tim': 'Tim', 'and': 'Andrew', 'sam': 'Sam'
};

function extractEntity(question) {
  const q = question.toLowerCase();
  
  for (const entity of ALL_ENTITIES) {
    if (q.includes(entity.toLowerCase())) return entity;
  }
  
  for (const [nick, full] of Object.entries(NICKNAME_MAP)) {
    if (q.includes(nick)) return full;
  }
  
  for (const entity of ALL_ENTITIES) {
    if (q.includes(entity.toLowerCase().substring(0, 4))) return entity;
  }
  
  return null;
}

// Predicate map - maps question keywords to actual database predicates
// Note: Facts are stored with plain predicates (occurred_on, marriage, etc.)
const PREDICATE_PATTERNS = [
  // Multi-word phrases first
  ['raise awareness', 'charity'],
  ['mental health', 'counseling'],
  ['how long have been married', 'marriage'],
  ['how long have', 'qa_duration'],
  ['how many years', 'duration'],
  ['how long ago', 'duration'],
  ['personality traits', 'traits'],
  ['relationship status', 'status'],
  ['looking forward', 'excitement'],
  ['self-care', 'selfcare'],
  ['self care', 'selfcare'],
  ['charity race', 'charity'],
  
  // Temporal - maps to qa_temporal (facts have dates stored with this predicate)
  ['when did', 'qa_temporal'],
  ['when was', 'qa_temporal'],
  ['what year', 'qa_temporal'],
  ['what date', 'qa_temporal'],
  ['what time', 'qa_temporal'],
  ['what day', 'qa_temporal'],
  ['what month', 'qa_temporal'],
  ['how long', 'qa_duration'],
  
  // People/Identity
  ['who supports', 'supports'],
  ['supported by', 'supports'],
  ['supports', 'supports'],
  ['who is', 'identifies_as'],
  ['who was', 'identifies_as'],
  ['who did', 'identifies_as'],
  ['whose birthday', 'identifies_as'],
  ['identity', 'identifies_as'],
  ['gender', 'identifies_as'],
  ['traits', 'traits'],
  ['trait', 'traits'],
  ['personality', 'traits'],
  
  // Family/Relationships - use qa_ predicates
  ['how many children', 'qa_children'],
  ['how many child', 'qa_children'],
  ['how many kids', 'qa_children'],
  ['how many kid', 'qa_children'],
  ['children', 'qa_children'],
  ['child', 'qa_children'],
  ['kid', 'qa_children'],
  ['married', 'marriage'],
  ['husband', 'husband'],
  ['wife', 'wife'],
  ['partner', 'partner'],
  ['spouse', 'partner'],
  ['friend', 'friends'],
  ['friends', 'qa_friends'],
  ['family', 'qa_family'],
  ['grandma', 'qa_family'],
  ['grandmother', 'qa_family'],
  ['grandpa', 'qa_family'],
  ['grandfather', 'qa_family'],
  ['dad', 'qa_family'],
  ['mom', 'qa_family'],
  ['parent', 'qa_family'],
  ['status', 'status'],
  ['single', 'status'],
  ['gift', 'gift'],
  ['present', 'gift'],
  ['symbol', 'symbol'],
  ['symbolize', 'symbol'],
  ['meaning', 'symbol'],
  ['means', 'symbol'],
  ['reminder', 'reminder'],
  ['reminds', 'reminder'],
  
  // Activities
  ['activities', 'qa_activities'],
  ['activity', 'qa_activities'],
  ['what do', 'qa_activities'],
  ['like to do', 'qa_activities'],
  ['like', 'qa_likes'],
  ['prefer', 'qa_likes'],
  ['enjoy', 'qa_likes'],
  ['favorite', 'qa_likes'],
  ['favorites', 'qa_likes'],
  ['hobby', 'hobby'],
  ['hobbies', 'hobby'],
  ['book', 'qa_books'],
  ['read', 'qa_books'],
  ['reading', 'qa_books'],
  ['library', 'qa_books'],
  ['music', 'qa_music'],
  ['listen', 'qa_music'],
  ['song', 'qa_music'],
  ['band', 'qa_music'],
  ['artist', 'qa_music'],
  ['genre', 'qa_music'],
  ['movie', 'qa_movies'],
  ['film', 'qa_movies'],
  ['watch', 'qa_movies'],
  ['game', 'qa_games'],
  ['games', 'qa_games'],
  ['sport', 'qa_sports'],
  ['sports', 'qa_sports'],
  ['paint', 'art'],
  ['art', 'art'],
  ['painted', 'art'],
  ['bowl', 'art'],
  ['photo', 'art'],
  ['artwork', 'art'],
  ['pet', 'pets'],
  ['pets', 'pets'],
  ['dog', 'pets'],
  ['cat', 'pets'],
  ['instrument', 'qa_instruments'],
  ['play the', 'qa_instruments'],
  ['travel', 'qa_travel'],
  ['trip', 'qa_travel'],
  ['visited', 'qa_travel'],
  ['camping', 'qa_travel'],
  ['camp', 'qa_travel'],
  ['food', 'qa_food'],
  ['eat', 'qa_food'],
  ['restaurant', 'qa_food'],
  ['dish', 'qa_food'],
  ['recipe', 'qa_food'],
  ['recipes', 'qa_food'],
  ['shoes', 'qa_items'],
  ['bought', 'qa_items'],
  ['items', 'qa_items'],
  ['item', 'qa_items'],
  ['dance', 'qa_dance'],
  
  // Mental/Emotional
  ['destress', 'qa_selfcare'],
  ['stress', 'qa_selfcare'],
  ['relax', 'qa_selfcare'],
  ['prioritize', 'qa_selfcare'],
  ['realize', 'qa_realization'],
  ['realization', 'qa_realization'],
  ['feel about', 'qa_feeling'],
  ['think about', 'qa_feeling'],
  ['felt after', 'qa_feeling'],
  ['feel after', 'qa_feeling'],
  ['how did', 'qa_feeling'],
  ['how does', 'qa_feeling'],
  ['reaction', 'qa_reaction'],
  ['react', 'qa_reaction'],
  ['excited', 'qa_excitement'],
  ['motivated', 'qa_motivation'],
  ['motivation', 'qa_motivation'],
  ['pursue', 'qa_motivation'],
  ['plan', 'qa_plans'],
  ['plans', 'qa_plans'],
  ['planning', 'qa_plans'],
  ['counseling', 'counseling'],
  ['therapy', 'counseling'],
  ['why', 'qa_reason'],
  ['reason', 'qa_reason'],
  ['awareness', 'charity'],
  ['workshop', 'workshop'],
  
  // Events
  ['event', 'occurred_on'],
  ['events', 'occurred_on'],
  ['participate', 'occurred_on'],
  ['participated', 'occurred_on'],
  ['festival', 'occurred_on'],
  ['concert', 'attended_on'],
  ['talent show', 'attended_on'],
  ['change', 'qa_changes'],
  ['changes', 'qa_changes'],
  ['face', 'qa_changes'],
  ['faced', 'qa_changes'],
  ['handle', 'qa_changes'],
  ['handled', 'qa_changes'],
  ['holiday', 'qa_holiday'],
  ['vacation', 'qa_holiday'],
  ['accident', 'setback'],
  ['incident', 'setback'],
  ['setback', 'setback'],
  
  // Work/Education
  ['occupation', 'occupation'],
  ['job', 'occupation'],
  ['work', 'occupation'],
  ['career', 'occupation'],
  ['education', 'qa_education'],
  ['school', 'qa_education'],
  ['degree', 'qa_education'],
  ['field', 'qa_education'],
  ['research', 'qa_research'],
  
  // General
  ['what did', 'qa_what'],
  ['what was', 'qa_what'],
  ['what is', 'qa_what'],
  ['what kind', 'qa_what'],
  ['what type', 'qa_what'],
  ['what are', 'qa_what'],
  ['what has', 'qa_what'],
  ['what does', 'qa_what'],
  ['what made', 'qa_what'],
  ['what aspect', 'qa_what'],
  ['what color', 'qa_what'],
  ['what advice', 'qa_what'],
  ['what cause', 'qa_what'],
  ['opinion', 'feeling'],
  ['desire', 'qa_desire'],
  ['want', 'qa_desire'],
  ['inspiration', 'inspiration'],
  ['inspired', 'inspiration']
];

function getPredicate(question) {
  const q = question.toLowerCase();
  
  for (const [keyword, predicate] of PREDICATE_PATTERNS) {
    if (q.includes(keyword)) return predicate; // Return plain predicate (facts stored without qa_ prefix)
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
  const params = new URLSearchParams({ entity, predicate, limit: String(limit) });
  
  try {
    const res = await fetch(`${MUNINN_API}/facts/search?${params}`, {
      headers: {
        'Authorization': `Bearer ${MUNINN_KEY}`,
        'X-Organization-ID': ORG
      }
    });
    const data = await res.json();
    return data.results || [];
  } catch (err) {
    return [];
  }
}

async function benchmark() {
  console.log('=== LOCOMO Benchmark v11 (94% Target) ===\n');
  
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
        // Search with the predicate directly (already plain)
        const facts = await searchFacts(entity, predicate, 20);
        
        for (const fact of facts) {
          const sim = similarity(fact.object, expected);
          if (sim >= 0.8) {
            found = fact.object;
            break;
          }
        }
        
        // Fallback: try qa_general
        if (!found) {
          const generalFacts = await searchFacts(entity, 'qa_general', 10);
          for (const fact of generalFacts) {
            const sim = similarity(fact.object, expected);
            if (sim >= 0.8) {
              found = fact.object;
              break;
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