import { WatchlistItem } from '../types'
import { GroupingOption } from '../components/GroupingControls'

export interface GroupedItems {
  [groupName: string]: WatchlistItem[]
}

export function groupWatchlistItems(items: WatchlistItem[], groupBy: GroupingOption): GroupedItems {
  if (groupBy === 'none') {
    return { 'All Items': items }
  }

  const grouped: GroupedItems = {}

  items.forEach(item => {
    let groupKey: string

    switch (groupBy) {
      case 'sector':
        groupKey = item.sector || 'Unknown Sector'
        break
      case 'industry':
        groupKey = item.industry || 'Unknown Industry'
        break
      case 'market_cap':
        groupKey = getMarketCapGroup(item.market_cap)
        break
      default:
        groupKey = 'Other'
    }

    if (!grouped[groupKey]) {
      grouped[groupKey] = []
    }
    grouped[groupKey].push(item)
  })

  // Sort groups by name and sort items within each group by symbol
  const sortedGroups: GroupedItems = {}
  Object.keys(grouped)
    .sort()
    .forEach(key => {
      sortedGroups[key] = grouped[key].sort((a, b) => a.symbol.localeCompare(b.symbol))
    })

  return sortedGroups
}

function getMarketCapGroup(marketCap?: number): string {
  if (!marketCap) return 'Unknown Market Cap'
  
  const cap = marketCap / 1000000000 // Convert to billions
  
  if (cap >= 200) return 'Mega Cap ($200B+)'
  if (cap >= 10) return 'Large Cap ($10B-$200B)'
  if (cap >= 2) return 'Mid Cap ($2B-$10B)'
  if (cap >= 0.3) return 'Small Cap ($300M-$2B)'
  if (cap >= 0.05) return 'Micro Cap ($50M-$300M)'
  return 'Nano Cap (<$50M)'
}

export function getGroupStats(groupedItems: GroupedItems) {
  const groups = Object.keys(groupedItems)
  const totalItems = Object.values(groupedItems).reduce((sum, items) => sum + items.length, 0)
  
  return {
    totalGroups: groups.length,
    totalItems,
    averageItemsPerGroup: totalItems / groups.length,
    largestGroup: groups.reduce((largest, group) => 
      groupedItems[group].length > groupedItems[largest]?.length ? group : largest, 
      groups[0]
    ),
    smallestGroup: groups.reduce((smallest, group) => 
      groupedItems[group].length < groupedItems[smallest]?.length ? group : smallest, 
      groups[0]
    )
  }
}