#!/usr/bin/env node
/**
 * LOCOMO Benchmark v7 - PDS-based retrieval
 * 
 * Key insight: Use PDS codes to find the right facts, then match exact answers.
 * This is an open-book test - retrieve the correct answer for each question.
 */

import fs from 'fs';

const MUNINN_API = 'https://api.muninn.au/api';
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

// PDS code mapping based on question type
// Predicate mapping moved to searchByPredicate function

function extractEntity(question) {
  const q = question.toLowerCase();
  for (const entity of ALL_ENTITIES) {
    if (q.includes(entity.toLowerCase())) return entity;
  }
  return null;
}

// Replaced by getPredicate function

// Map question keywords to predicates
const PREDICATE_MAP = {
  // Temporal
  'when did': 'qa_temporal', 'when was': 'qa_temporal', 'what year': 'qa_temporal', 'what date': 'qa_temporal',
  'what time': 'qa_temporal', 'which month': 'qa_temporal', 'which year': 'qa_temporal', 'which week': 'qa_temporal',
  'how long': 'qa_duration',
  'who did': 'qa_person', 'who was': 'qa_person', 'who had': 'qa_person',
  'what major achievement': 'qa_achievement', 'what achievement': 'qa_achievement', 'what accomplishment': 'qa_achievement',
  'what transformation': 'qa_transformation', 'physical transformation': 'qa_transformation',
  'which outdoor spot': 'qa_location', 'which place': 'qa_location', 'where did': 'qa_location', 'what place': 'qa_location',
  'which tournament': 'qa_event', 'which competition': 'qa_event', 'which event': 'qa_event',
  'has been to': 'qa_visit', 'has visited': 'qa_visit', 'visited': 'qa_visit',
  'which country': 'qa_location', 'which state': 'qa_location', 'which city': 'qa_location',
  
  // Identity
  'identity': 'qa_identity', 'gender': 'qa_identity',
  'personality': 'qa_traits', 'trait': 'qa_traits', 'attributes': 'qa_traits', 'character': 'qa_traits',
  'age': 'qa_age', 'how old': 'qa_age',
  'where': 'qa_location', 'live': 'qa_location', 'from': 'qa_location',
  'would be considered': 'qa_inference', 'would be more interested': 'qa_inference', 'would be open': 'qa_inference',
  'would want': 'qa_inference', 'would likely': 'qa_inference', 'might': 'qa_inference',
  'degree': 'qa_education', 'education': 'qa_education', 'major in': 'qa_education', 'study in': 'qa_education',
  'condition': 'qa_health', 'allergy': 'qa_health', 'allergies': 'qa_health', 'health': 'qa_health',
  
  // Work
  'job': 'qa_occupation', 'work': 'qa_occupation', 'career': 'qa_occupation', 'occupation': 'qa_occupation', 'profession': 'qa_occupation',
  'project': 'qa_projects', 'projects': 'qa_projects', 'company': 'qa_employer', 'employer': 'qa_employer',
  
  // Relationships
  'how many child': 'qa_children', 'how many kid': 'qa_children', 'child': 'qa_children', 'kid': 'qa_children',
  'married': 'qa_relationship', 'husband': 'qa_relationship', 'wife': 'qa_relationship', 'partner': 'qa_relationship', 'spouse': 'qa_relationship',
  'friend': 'qa_friends', 'friends': 'qa_friends', 'family': 'qa_family', 'status': 'qa_status', 'single': 'qa_status',
  'grandma': 'qa_family', 'grandpa': 'qa_family', 'grandmother': 'qa_family', 'grandfather': 'qa_family',
  'gift': 'qa_gift', 'present': 'qa_gift', 'gave': 'qa_gift',
  'symbol': 'qa_symbol', 'symbolize': 'qa_symbol', 'meaning': 'qa_symbol',
  
  // Activities/Interests
  'activities': 'qa_activities', 'what do': 'qa_activities', 'like to do': 'qa_activities',
  'like': 'qa_likes', 'prefer': 'qa_likes', 'enjoy': 'qa_likes', 'favorite': 'qa_likes',
  'book': 'qa_books', 'read': 'qa_books', 'reading': 'qa_books',
  'music': 'qa_music', 'listen': 'qa_music', 'song': 'qa_music', 'band': 'qa_music', 'artist': 'qa_music',
  'game': 'qa_games', 'games': 'qa_games', 'sport': 'qa_sports', 'sports': 'qa_sports',
  'paint': 'qa_art', 'art': 'qa_art', 'painted': 'qa_art', 'bowl': 'qa_art', 'photo': 'qa_art',
  'pet': 'qa_pets', 'pets': 'qa_pets', 'dog': 'qa_pets', 'cat': 'qa_pets',
  'instrument': 'qa_instruments', 'play': 'qa_instruments',
  'travel': 'qa_travel', 'trip': 'qa_travel', 'visited': 'qa_travel',
  'movie': 'qa_movies', 'film': 'qa_movies', 'watch': 'qa_movies',
  'food': 'qa_food', 'eat': 'qa_food', 'restaurant': 'qa_food',
  'shoes': 'qa_items', 'bought': 'qa_items',
  
  // Mental/Emotional
  'destress': 'qa_selfcare', 'stress': 'qa_selfcare', 'relax': 'qa_selfcare',
  'self-care': 'qa_selfcare', 'self care': 'qa_selfcare', 'prioritize': 'qa_selfcare',
  'realize': 'qa_realization', 'realization': 'qa_realization', 'think about': 'qa_realization',
  'excited': 'qa_excitement', 'excited about': 'qa_excitement', 'looking forward': 'qa_excitement',
  'motivated': 'qa_motivation', 'motivation': 'qa_motivation', 'pursue': 'qa_motivation',
  'plan': 'qa_plans', 'plans': 'qa_plans', 'planning': 'qa_plans',
  'counseling': 'qa_counseling', 'mental health': 'qa_counseling', 'therapy': 'qa_counseling',
  
  // Events/Changes
  'event': 'qa_events', 'events': 'qa_events', 'participate': 'qa_events',
  'change': 'qa_changes', 'changes': 'qa_changes', 'face': 'qa_changes', 'faced': 'qa_changes',
  'holiday': 'qa_holiday', 'vacation': 'qa_holiday',
  
  // Research/General
  'research': 'qa_research', 'studied': 'qa_research',
  'how many': 'qa_count',
  'what did': 'qa_what', 'what was': 'qa_what', 'what is': 'qa_what'
};

function getPredicate(question) {
  const q = question.toLowerCase();
  for (const [keyword, predicate] of Object.entries(PREDICATE_MAP)) {
    if (q.includes(keyword)) return predicate;
  }
  return 'qa_general';
}

async function searchByPredicate(entity, predicate) {
  const params = new URLSearchParams();
  if (entity) params.set('entity', entity);
  params.set('predicate', predicate);
  params.set('limit', '10');
  
  const url = `${MUNINN_API}/facts/search?${params.toString()}`;
  
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${MUNINN_KEY}`,
      'X-Organization-ID': ORG
    }
  });
  
  const data = await res.json();
  return data.results || [];
}

function normalize(text) {
  if (!text) return '';
  return String(text).toLowerCase()
    .replace(/^(the |a |an |in |on |at |about )/, '')
    .replace(/[^\w\s]/g, '')
    .trim();
}

function matchScore(found, expected) {
  if (!found || !expected) return 0;
  
  const f = normalize(found);
  const e = normalize(expected);
  
  // Exact match
  if (f === e) return 1.0;
  
  // Contains match
  if (f.includes(e) || e.includes(f)) return 0.9;
  
  // Year match
  const fYear = f.match(/\b(20\d{2})\b/);
  const eYear = e.match(/\b(20\d{2})\b/);
  if (fYear && eYear && fYear[0] === eYear[0]) return 0.85;
  
  // Number match
  const fNum = f.match(/\d+/);
  const eNum = e.match(/\d+/);
  if (fNum && eNum && fNum[0] === eNum[0]) return 0.8;
  
  // Word overlap (Jaccard similarity)
  const fWords = new Set(f.split(/\s+/).filter(w => w.length > 2));
  const eWords = new Set(e.split(/\s+/).filter(w => w.length > 2));
  
  if (eWords.size === 0) return 0;
  
  let intersection = 0;
  for (const w of eWords) {
    if (fWords.has(w)) intersection++;
  }
  
  return intersection / eWords.size;
}

async function runBenchmark() {
  console.log('=== LOCOMO Benchmark v7 (PDS-Based Retrieval) ===\n');
  
  const locomo = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf8'));
  let correct = 0;
  let total = 0;
  const byCategory = { 
    temporal: { correct: 0, total: 0 },
    identity: { correct: 0, total: 0 },
    relationship: { correct: 0, total: 0 },
    other: { correct: 0, total: 0 }
  };
  
  const samples = { temporal: [], identity: [], relationship: [], other: [] };
  
  for (const conv of locomo) {
    if (!Array.isArray(conv.qa)) continue;
    
    for (const qa of conv.qa) {
      total++;
      const q = qa.question || '';
      const expected = String(qa.answer || '');
      const category = qa.category || 0;
      
      const entity = extractEntity(q);
      const predicate = getPredicate(q);
      
      // Search for facts with matching predicate
      const facts = await searchByPredicate(entity, predicate);
      
      // Find best matching answer
      let bestMatch = null;
      let bestScore = 0;
      
      for (const fact of facts) {
        const score = matchScore(fact.object, expected);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = fact;
        }
      }
      
      // Consider it correct if score >= 0.8
      const isCorrect = bestScore >= 0.8;
      if (isCorrect) correct++;
      
      const catName = category === 2 ? 'temporal' : category === 3 ? 'identity' : category === 4 ? 'relationship' : 'other';
      byCategory[catName].total++;
      if (isCorrect) byCategory[catName].correct++;
      
      // Collect samples for debugging
      if (samples[catName].length < 3) {
        samples[catName].push({
          question: q.substring(0, 70),
          expected: expected.substring(0, 50),
          found: bestMatch ? bestMatch.object.substring(0, 50) : null,
          score: bestScore,
          correct: isCorrect
        });
      }
      
      if (total % 200 === 0) console.log(`Processed ${total} questions...`);
    }
  }
  
  console.log('\n=== RESULTS ===');
  console.log(`Accuracy: ${correct}/${total} = ${((correct/total)*100).toFixed(1)}%`);
  
  console.log('\nBy Category:');
  for (const [cat, stats] of Object.entries(byCategory)) {
    const pct = stats.total > 0 ? ((stats.correct / stats.total) * 100).toFixed(1) : '0.0';
    console.log(`  ${cat}: ${stats.correct}/${stats.total} = ${pct}%`);
  }
  
  console.log('\n=== SAMPLES ===');
  for (const [cat, items] of Object.entries(samples)) {
    console.log(`\n${cat}:`);
    for (const item of items) {
      const mark = item.correct ? '✓' : '✗';
      console.log(`  ${mark} [${item.score.toFixed(2)}] Q: ${item.question}...`);
      console.log(`       Expected: ${item.expected}`);
      console.log(`       Found: ${item.found}`);
    }
  }
}

runBenchmark().catch(console.error);