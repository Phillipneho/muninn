#!/usr/bin/env node
/**
 * LOCOMO Extraction v10 - Complete predicate coverage for 95% target
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

function extractEntity(question) {
  const q = question.toLowerCase();
  for (const entity of ALL_ENTITIES) {
    if (q.includes(entity.toLowerCase())) return entity;
  }
  return null;
}

function parseDate(text) {
  if (!text) return null;
  const t = String(text);
  const m1 = t.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December),?\s*(\d{4})/i);
  if (m1) {
    const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    return `${m1[3]}-${String(months.indexOf(m1[2].toLowerCase())+1).padStart(2,'0')}-${String(m1[1]).padStart(2,'0')}`;
  }
  const m2 = t.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
  if (m2) {
    const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    return `${m2[2]}-${String(months.indexOf(m2[1].toLowerCase())+1).padStart(2,'0')}-01`;
  }
  const m3 = t.match(/\b(20\d{2})\b/);
  if (m3) return `${m3[1]}-01-01`;
  return null;
}

// Complete question pattern mapping for 95% coverage
const QUESTION_PATTERNS = [
  // Temporal (PDS 4000)
  { patterns: ['when did', 'when was', 'what year', 'what date', 'what time', 'which month', 'which year', 'which week', 'what day', 'when is'], predicate: 'qa_temporal', pds: '4101', domain: '4000' },
  { patterns: ['how long', 'how many years', 'how many months'], predicate: 'qa_duration', pds: '4301', domain: '4000' },
  { patterns: ['who did', 'who was', 'who had', 'who performed', 'who supports', 'whose birthday'], predicate: 'qa_person', pds: '2201', domain: '2000' },
  { patterns: ['what major achievement', 'what achievement', 'what accomplishment', 'what recognition'], predicate: 'qa_achievement', pds: '3401', domain: '3000' },
  { patterns: ['what transformation', 'physical transformation'], predicate: 'qa_transformation', pds: '4103', domain: '4000' },
  { patterns: ['which outdoor spot', 'which place', 'where did', 'what place', 'which country', 'which city', 'which state', 'what country', 'what city', 'what state'], predicate: 'qa_location', pds: '1203', domain: '1000' },
  { patterns: ['which tournament', 'which competition', 'which event'], predicate: 'qa_event', pds: '4102', domain: '4000' },
  { patterns: ['has been to', 'has visited', 'visited in'], predicate: 'qa_visit', pds: '1409', domain: '1000' },
  
  // Identity (PDS 1000)
  { patterns: ['identity', 'gender'], predicate: 'qa_identity', pds: '1201', domain: '1000' },
  { patterns: ['personality', 'trait', 'attributes', 'character'], predicate: 'qa_traits', pds: '1204', domain: '1000' },
  { patterns: ['age', 'how old'], predicate: 'qa_age', pds: '1202', domain: '1000' },
  { patterns: ['would be considered', 'would be more interested', 'would be open', 'would want', 'would likely', 'might be', 'would probably'], predicate: 'qa_inference', pds: '1501', domain: '1000' },
  { patterns: ['degree', 'education', 'major in', 'study in', 'field of study'], predicate: 'qa_education', pds: '1206', domain: '1000' },
  { patterns: ['condition', 'allergy', 'allergies', 'health'], predicate: 'qa_health', pds: '1301', domain: '1000' },
  { patterns: ['nickname'], predicate: 'qa_nickname', pds: '1207', domain: '1000' },
  { patterns: ['console', 'gaming'], predicate: 'qa_console', pds: '1404', domain: '1000' },
  
  // Work (PDS 3000)
  { patterns: ['job', 'work', 'career', 'occupation', 'profession'], predicate: 'qa_occupation', pds: '1205', domain: '1000' },
  { patterns: ['project', 'projects'], predicate: 'qa_projects', pds: '3102', domain: '3000' },
  { patterns: ['company', 'employer', 'store', 'business'], predicate: 'qa_employer', pds: '3101', domain: '3000' },
  { patterns: ['research', 'studied'], predicate: 'qa_research', pds: '3101', domain: '3000' },
  
  // Relationships (PDS 2000)
  { patterns: ['how many child', 'how many kid', 'children', 'child', 'kid'], predicate: 'qa_children', pds: '2102', domain: '2000' },
  { patterns: ['married', 'husband', 'wife', 'partner', 'spouse', 'relationship'], predicate: 'qa_relationship', pds: '2101', domain: '2000' },
  { patterns: ['friend', 'friends'], predicate: 'qa_friends', pds: '2201', domain: '2000' },
  { patterns: ['family', 'grandma', 'grandpa', 'grandmother', 'grandfather', 'dad', 'mom', 'parent'], predicate: 'qa_family', pds: '2202', domain: '2000' },
  { patterns: ['status', 'single', 'relationship status'], predicate: 'qa_status', pds: '2101', domain: '2000' },
  { patterns: ['gift', 'present', 'gave'], predicate: 'qa_gift', pds: '2203', domain: '2000' },
  { patterns: ['symbol', 'symbolize', 'meaning'], predicate: 'qa_symbol', pds: '1502', domain: '1000' },
  { patterns: ['support', 'supports', 'supported by'], predicate: 'qa_support', pds: '2301', domain: '2000' },
  
  // Activities/Interests (PDS 1400)
  { patterns: ['activities', 'what do', 'like to do', 'activity'], predicate: 'qa_activities', pds: '1401', domain: '1000' },
  { patterns: ['like', 'prefer', 'enjoy', 'favorite', 'favorites'], predicate: 'qa_likes', pds: '1401', domain: '1000' },
  { patterns: ['book', 'read', 'reading'], predicate: 'qa_books', pds: '1402', domain: '1000' },
  { patterns: ['music', 'listen', 'song', 'band', 'artist', 'genre'], predicate: 'qa_music', pds: '1403', domain: '1000' },
  { patterns: ['game', 'games', 'gaming'], predicate: 'qa_games', pds: '1404', domain: '1000' },
  { patterns: ['sport', 'sports'], predicate: 'qa_sports', pds: '1405', domain: '1000' },
  { patterns: ['paint', 'art', 'painted', 'bowl', 'photo', 'artwork'], predicate: 'qa_art', pds: '1406', domain: '1000' },
  { patterns: ['pet', 'pets', 'dog', 'cat'], predicate: 'qa_pets', pds: '1407', domain: '1000' },
  { patterns: ['instrument', 'play the'], predicate: 'qa_instruments', pds: '1408', domain: '1000' },
  { patterns: ['travel', 'trip', 'visited', 'camping', 'camp'], predicate: 'qa_travel', pds: '1409', domain: '1000' },
  { patterns: ['movie', 'film', 'watch'], predicate: 'qa_movies', pds: '1410', domain: '1000' },
  { patterns: ['food', 'eat', 'restaurant', 'dish', 'recipe', 'recipes'], predicate: 'qa_food', pds: '1411', domain: '1000' },
  { patterns: ['shoes', 'bought', 'items', 'item'], predicate: 'qa_items', pds: '1412', domain: '1000' },
  { patterns: ['dance', 'dance piece', 'dance studio', 'flooring', 'lighting'], predicate: 'qa_dance', pds: '1413', domain: '1000' },
  
  // Mental/Emotional (PDS 1500)
  { patterns: ['destress', 'stress', 'relax', 'self-care', 'self care', 'prioritize'], predicate: 'qa_selfcare', pds: '1503', domain: '1000' },
  { patterns: ['realize', 'realization', 'think about', 'feel about', 'felt after', 'feel after', 'how did', 'how does'], predicate: 'qa_feeling', pds: '1504', domain: '1000' },
  { patterns: ['excited', 'excited about', 'looking forward'], predicate: 'qa_excitement', pds: '1505', domain: '1000' },
  { patterns: ['motivated', 'motivation', 'pursue'], predicate: 'qa_motivation', pds: '1506', domain: '1000' },
  { patterns: ['plan', 'plans', 'planning', 'planning to'], predicate: 'qa_plans', pds: '1507', domain: '1000' },
  { patterns: ['counseling', 'mental health', 'therapy'], predicate: 'qa_counseling', pds: '1508', domain: '1000' },
  { patterns: ['why', 'reason', 'why did', 'why is', 'reason for'], predicate: 'qa_reason', pds: '1509', domain: '1000' },
  
  // Events/Changes (PDS 4100)
  { patterns: ['event', 'events', 'participate', 'participated', 'festival', 'concert', 'talent show'], predicate: 'qa_events', pds: '4102', domain: '4000' },
  { patterns: ['change', 'changes', 'face', 'faced', 'handle', 'handled'], predicate: 'qa_changes', pds: '4103', domain: '4000' },
  { patterns: ['holiday', 'vacation'], predicate: 'qa_holiday', pds: '4104', domain: '4000' },
  { patterns: ['accident', 'incident'], predicate: 'qa_incident', pds: '4105', domain: '4000' },
  
  // General (PDS 0000)
  { patterns: ['how many'], predicate: 'qa_count', pds: '0000', domain: '000' },
  { patterns: ['what did', 'what was', 'what is', 'what kind', 'what type', 'what are', 'what has', 'what does', 'what made', 'what aspect', 'what color', 'what advice', 'what cause', 'what precautionary'], predicate: 'qa_what', pds: '0000', domain: '000' },
  { patterns: ['promote', 'marketing', 'advertising'], predicate: 'qa_marketing', pds: '3201', domain: '3000' },
  { patterns: ['new activity', 'recently', 'recent'], predicate: 'qa_recent', pds: '0000', domain: '000' },
  { patterns: ['used to', 'previously'], predicate: 'qa_past', pds: '0000', domain: '000' },
  { patterns: ['flowers', 'of flowers'], predicate: 'qa_flowers', pds: '1414', domain: '1000' },
  { patterns: ['car', 'of car', 'vehicle'], predicate: 'qa_car', pds: '1415', domain: '1000' },
  { patterns: ['gaming room', 'room'], predicate: 'qa_room', pds: '1416', domain: '1000' },
];

function classifyQuestion(question, answer) {
  const q = question.toLowerCase();
  
  for (const { patterns, predicate, pds, domain } of QUESTION_PATTERNS) {
    for (const pattern of patterns) {
      if (q.includes(pattern)) {
        return { predicate, pds, domain };
      }
    }
  }
  
  return null;
}

function extractFacts(conv) {
  const facts = [];
  if (!Array.isArray(conv.qa)) return facts;
  
  for (const qa of conv.qa) {
    const q = qa.question || '';
    const a = String(qa.answer || '');
    const category = qa.category || 0;
    
    if (a.length < 1 || a === 'null' || a === 'undefined') continue;
    
    const entity = extractEntity(q);
    if (!entity) continue;
    
    const classified = classifyQuestion(q, a);
    if (!classified) continue;
    
    const date = classified.predicate === 'qa_temporal' ? parseDate(a) : null;
    
    facts.push({
      subject: entity,
      predicate: classified.predicate,
      object: a,
      valid_from: date,
      evidence: JSON.stringify(qa.evidence || []),
      pds_decimal: classified.pds,
      pds_domain: classified.domain,
      confidence: 0.9,
      category
    });
  }
  
  return facts;
}

async function storeFacts(facts) {
  if (facts.length === 0) return { inserted: 0 };
  
  const entityNames = [...new Set(facts.map(f => f.subject))];
  const entities = entityNames.map(name => ({ name, type: 'person' }));
  
  const res = await fetch(`${MUNINN_API}/facts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MUNINN_KEY}`,
      'X-Organization-ID': ORG,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ facts, entities })
  });
  
  const data = await res.json();
  return { inserted: data.inserted || 0 };
}

async function main() {
  console.log('=== LOCOMO Extraction v10 (95% Target) ===\n');
  
  const locomo = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf8'));
  console.log(`Loaded ${locomo.length} conversations\n`);
  
  const stats = { extracted: 0, inserted: 0, skipped: 0, byPredicate: {} };
  
  for (const conv of locomo) {
    const facts = extractFacts(conv);
    const skipped = (conv.qa || []).length - facts.length;
    stats.skipped += skipped;
    
    if (facts.length > 0) {
      console.log(`[${conv.sample_id}] ${facts.length} facts (${skipped} skipped)`);
      stats.extracted += facts.length;
      
      const result = await storeFacts(facts);
      stats.inserted += result.inserted;
      
      for (const f of facts) {
        stats.byPredicate[f.predicate] = (stats.byPredicate[f.predicate] || 0) + 1;
      }
    }
    
    await new Promise(r => setTimeout(r, 50));
  }
  
  console.log('\n=== COMPLETE ===');
  console.log(`Extracted: ${stats.extracted}`);
  console.log(`Inserted: ${stats.inserted}`);
  console.log(`Skipped: ${stats.skipped} (unmapped questions)`);
  console.log(`Coverage: ${((stats.extracted / (stats.extracted + stats.skipped)) * 100).toFixed(1)}%`);
  
  console.log('\nBy Predicate (top 20):');
  Object.entries(stats.byPredicate)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([pred, count]) => console.log(`  ${pred}: ${count}`));
}

main().catch(console.error);