import { format, subDays, subWeeks, subMonths, addDays, addWeeks, addMonths, parseISO, eachDayOfInterval } from 'date-fns';

/**
 * Pre-processes text to replace relative date markers with absolute ISO dates.
 * This anchors the LLM's extraction logic by converting reasoning tasks to extraction tasks.
 * 
 * Example:
 *   Input: "I met her last Tuesday", sessionDate: "2023-05-15"
 *   Output: "I met her 2023-05-09"
 */
export function resolveRelativeDates(text: string, sessionDate: string): string {
  // Parse sessionDate - handle both ISO and natural language formats
  let baseDate: Date;
  
  // Try ISO format first
  if (/^\d{4}-\d{2}-\d{2}/.test(sessionDate)) {
    baseDate = parseISO(sessionDate);
  } else {
    // Parse natural language: "1:56 pm on 8 May, 2023" or "8 May, 2023"
    const dateMatch = sessionDate.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December),?\s+(\d{4})/i);
    if (dateMatch) {
      const [, day, month, year] = dateMatch;
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                          'July', 'August', 'September', 'October', 'November', 'December'];
      const monthIndex = monthNames.findIndex(m => m.toLowerCase() === month.toLowerCase());
      baseDate = new Date(parseInt(year), monthIndex, parseInt(day));
    } else {
      // Fallback to today
      baseDate = new Date();
    }
  }
  
  let processedText = text;

  // Static replacements
  const staticReplacements: { [key: string]: string } = {
    'today': format(baseDate, 'yyyy-MM-dd'),
    'yesterday': format(subDays(baseDate, 1), 'yyyy-MM-dd'),
    'day before yesterday': format(subDays(baseDate, 2), 'yyyy-MM-dd'),
    'last week': format(subWeeks(baseDate, 1), 'yyyy-MM-dd'),
    'last month': format(subMonths(baseDate, 1), 'yyyy-MM-dd'),
    'this week': format(baseDate, 'yyyy-MM-dd'),
    'this month': format(baseDate, 'yyyy-MM-dd'),
    'next week': format(addWeeks(baseDate, 1), 'yyyy-MM-dd'),
    'next month': format(addMonths(baseDate, 1), 'yyyy-MM-dd'),
  };

  // Apply static replacements (case-insensitive)
  for (const [key, value] of Object.entries(staticReplacements)) {
    const regex = new RegExp(`\\b${key}\\b`, 'gi');
    processedText = processedText.replace(regex, value);
  }

  // Handle "last [Weekday]" (e.g., "last Tuesday", "last Friday")
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'];
  
  for (let i = 0; i < daysOfWeek.length; i++) {
    const day = daysOfWeek[i];
    const targetIndex = i;
    const regex = new RegExp(`last ${day}`, 'gi');
    if (regex.test(processedText)) {
      // Look back up to 7 days to find the last occurrence of that weekday
      const days = eachDayOfInterval({
        start: subDays(baseDate, 7),
        end: subDays(baseDate, 1)
      });
      const lastOccurrence = days.reverse().find((d: Date) => d.getDay() === targetIndex);

      if (lastOccurrence) {
        processedText = processedText.replace(regex, format(lastOccurrence, 'yyyy-MM-dd'));
      }
    }
  }

  // Handle "next [Weekday]" (e.g., "next Tuesday", "next Friday")
  for (let i = 0; i < daysOfWeek.length; i++) {
    const day = daysOfWeek[i];
    const targetIndex = i;
    const regex = new RegExp(`next ${day}`, 'gi');
    if (regex.test(processedText)) {
      // Look forward up to 7 days to find the next occurrence of that weekday
      const days = eachDayOfInterval({
        start: baseDate,
        end: addDays(baseDate, 7)
      });
      const nextOccurrence = days.find((d: Date) => d.getDay() === targetIndex);

      if (nextOccurrence) {
        processedText = processedText.replace(regex, format(nextOccurrence, 'yyyy-MM-dd'));
      }
    }
  }

  // Handle "X days ago" (e.g., "3 days ago", "a few days ago")
  const daysAgoMatch = processedText.match(/(\d+|a few|several)\s+days?\s+ago/gi);
  if (daysAgoMatch) {
    for (const match of daysAgoMatch) {
      const numMatch = match.match(/(\d+)/);
      const numDays = numMatch ? parseInt(numMatch[1]) : 3; // Default to 3 for "a few/several"
      const resolvedDate = format(subDays(baseDate, numDays), 'yyyy-MM-dd');
      processedText = processedText.replace(match, resolvedDate);
    }
  }

  // Handle "in X days" (e.g., "in 3 days", "in a few days")
  const inDaysMatch = processedText.match(/in (\d+|a few|several) days?/gi);
  if (inDaysMatch) {
    for (const match of inDaysMatch) {
      const numMatch = match.match(/(\d+)/);
      const numDays = numMatch ? parseInt(numMatch[1]) : 3;
      const resolvedDate = format(addDays(baseDate, numDays), 'yyyy-MM-dd');
      processedText = processedText.replace(match, resolvedDate);
    }
  }

  // Handle "X weeks ago" (e.g., "2 weeks ago", "a few weeks ago")
  const weeksAgoMatch = processedText.match(/(\d+|a few|several)\s+weeks?\s+ago/gi);
  if (weeksAgoMatch) {
    for (const match of weeksAgoMatch) {
      const numMatch = match.match(/(\d+)/);
      const numWeeks = numMatch ? parseInt(numMatch[1]) : 2; // Default to 2 for "a few/several"
      const resolvedDate = format(subWeeks(baseDate, numWeeks), 'yyyy-MM-dd');
      processedText = processedText.replace(match, resolvedDate);
    }
  }

  // Handle "in X weeks" (e.g., "in 2 weeks")
  const inWeeksMatch = processedText.match(/in (\d+|a few|several) weeks?/gi);
  if (inWeeksMatch) {
    for (const match of inWeeksMatch) {
      const numMatch = match.match(/(\d+)/);
      const numWeeks = numMatch ? parseInt(numMatch[1]) : 2;
      const resolvedDate = format(addWeeks(baseDate, numWeeks), 'yyyy-MM-dd');
      processedText = processedText.replace(match, resolvedDate);
    }
  }

  // Handle "X months ago" (e.g., "3 months ago")
  const monthsAgoMatch = processedText.match(/(\d+|a few|several)\s+months?\s+ago/gi);
  if (monthsAgoMatch) {
    for (const match of monthsAgoMatch) {
      const numMatch = match.match(/(\d+)/);
      const numMonths = numMatch ? parseInt(numMatch[1]) : 2; // Default to 2 for "a few/several"
      const resolvedDate = format(subMonths(baseDate, numMonths), 'yyyy-MM-dd');
      processedText = processedText.replace(match, resolvedDate);
    }
  }

  // Handle "in X months" (e.g., "in 3 months")
  const inMonthsMatch = processedText.match(/in (\d+|a few|several) months?/gi);
  if (inMonthsMatch) {
    for (const match of inMonthsMatch) {
      const numMatch = match.match(/(\d+)/);
      const numMonths = numMatch ? parseInt(numMatch[1]) : 2;
      const resolvedDate = format(addMonths(baseDate, numMonths), 'yyyy-MM-dd');
      processedText = processedText.replace(match, resolvedDate);
    }
  }

  // Handle "X years ago" → absolute year (e.g., "4 years ago" with 2023-05-08 → 2019)
  const yearsAgoMatch = processedText.match(/(\d+)\s+years?\s+ago/gi);
  if (yearsAgoMatch) {
    for (const match of yearsAgoMatch) {
      const numMatch = match.match(/(\d+)/);
      if (numMatch) {
        const numYears = parseInt(numMatch[1]);
        const targetYear = baseDate.getFullYear() - numYears;
        processedText = processedText.replace(match, targetYear.toString());
      }
    }
  }

  // Handle "last year" → previous year (e.g., 2023-05-08 → 2022)
  const lastYear = baseDate.getFullYear() - 1;
  processedText = processedText.replace(/\blast year\b/gi, lastYear.toString());

  // Handle "next year" → next year
  const nextYear = baseDate.getFullYear() + 1;
  processedText = processedText.replace(/\bnext year\b/gi, nextYear.toString());

  // Handle "last [month name]" (e.g., "last January", "last December")
  for (let i = 0; i < monthNames.length; i++) {
    const month = monthNames[i];
    const monthIndex = i;
    const regex = new RegExp(`last ${month}`, 'gi');
    if (regex.test(processedText)) {
      // Find the previous occurrence of that month
      // "Last January" when in May 2023 = January 2023 (the most recent past January)
      let targetYear = baseDate.getFullYear();
      
      if (monthIndex >= baseDate.getMonth()) {
        targetYear--; // Go to previous year if the month hasn't happened yet this year
      }
      
      const resolvedDate = format(new Date(targetYear, monthIndex, 1), 'yyyy-MM-dd');
      processedText = processedText.replace(regex, resolvedDate);
    }
  }

  // Handle "next [month name]" (e.g., "next January")
  for (let i = 0; i < monthNames.length; i++) {
    const month = monthNames[i];
    const monthIndex = i;
    const regex = new RegExp(`next ${month}`, 'gi');
    if (regex.test(processedText)) {
      // Find next occurrence of that month
      let targetYear = baseDate.getFullYear();
      if (monthIndex > baseDate.getMonth()) {
        // Same year, later month
        targetYear = baseDate.getFullYear();
      } else {
        // Next year
        targetYear = baseDate.getFullYear() + 1;
      }
      const resolvedDate = format(new Date(targetYear, monthIndex, 1), 'yyyy-MM-dd');
      processedText = processedText.replace(regex, resolvedDate);
    }
  }

  // Handle "this [month name]" (e.g., "this January" when session is in January)
  for (let i = 0; i < monthNames.length; i++) {
    const month = monthNames[i];
    const monthIndex = i;
    const regex = new RegExp(`this ${month}`, 'gi');
    if (regex.test(processedText)) {
      // "This January" = January of current year
      const resolvedDate = format(new Date(baseDate.getFullYear(), monthIndex, 1), 'yyyy-MM-dd');
      processedText = processedText.replace(regex, resolvedDate);
    }
  }

  // Handle "in [month name]" (e.g., "in June" → June of current year)
  for (let i = 0; i < monthNames.length; i++) {
    const month = monthNames[i];
    const monthIndex = i;
    const regex = new RegExp(`\\bin ${month}\\b`, 'gi');
    if (regex.test(processedText)) {
      // "In June" = June of current year (or next year if month has passed)
      let targetYear = baseDate.getFullYear();
      if (monthIndex < baseDate.getMonth()) {
        targetYear++; // Month has passed this year, assume next year
      }
      const resolvedDate = format(new Date(targetYear, monthIndex, 1), 'yyyy-MM-dd');
      processedText = processedText.replace(regex, resolvedDate);
    }
  }

  // Handle "the [weekday] before [date]" pattern (e.g., "the sunday before 25 May 2023")
  const beforePattern = /the (Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday) before (\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})/i;
  const beforeMatch = processedText.match(beforePattern);
  if (beforeMatch) {
    const targetDay = beforeMatch[1];
    const refDay = parseInt(beforeMatch[2]);
    const refMonth = monthNames.indexOf(beforeMatch[3]);
    const refYear = parseInt(beforeMatch[4]);
    const refDate = new Date(refYear, refMonth, refDay);
    
    // Find the last occurrence of targetDay before refDate
    const targetDayIndex = daysOfWeek.findIndex(d => d.toLowerCase() === targetDay.toLowerCase());
    const daysBeforeRef = eachDayOfInterval({
      start: subDays(refDate, 7),
      end: subDays(refDate, 1)
    });
    const targetDate = daysBeforeRef.reverse().find((d: Date) => d.getDay() === targetDayIndex);
    
    if (targetDate) {
      processedText = processedText.replace(beforeMatch[0], format(targetDate, 'yyyy-MM-dd'));
    }
  }

  // Handle "the week before [date]" pattern (e.g., "the week before 9 June 2023")
  const weekBeforePattern = /the week before (\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})/gi;
  const weekBeforeMatch = processedText.match(weekBeforePattern);
  if (weekBeforeMatch) {
    for (const match of weekBeforeMatch) {
      const parts = match.match(/the week before (\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})/i);
      if (parts) {
        const refDay = parseInt(parts[1]);
        const refMonth = monthNames.indexOf(parts[2]);
        const refYear = parseInt(parts[3]);
        const refDate = new Date(refYear, refMonth, refDay);
        
        // Week before = 7 days before
        const weekBefore = subWeeks(refDate, 1);
        processedText = processedText.replace(match, format(weekBefore, 'yyyy-MM-dd'));
      }
    }
  }

  return processedText;
}

/**
 * Enriches content with session date context for the LLM.
 * Prepends a context line to help the LLM understand the temporal reference frame.
 */
export function addTemporalContext(content: string, sessionDate: string): string {
  const resolvedContent = resolveRelativeDates(content, sessionDate);
  return `Context: Today's date is ${sessionDate}.\n\nText: ${resolvedContent}`;
}