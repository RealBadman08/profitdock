# Deriv Official UI Design Analysis

## Color Scheme

### Primary Colors
- **Brand Red**: #FF444F (primary buttons, accents, branding)
- **Teal/Cyan**: #4BB4B3 (Buy buttons, positive actions)
- **Background**: #FFFFFF (main background)
- **Secondary Background**: #F2F3F4 (panels, cards)
- **Dark Text**: #333333
- **Light Text**: #999999

### Chart Colors
- **Chart Background**: White/Light gray
- **Grid Lines**: Very light gray (#F5F5F5)
- **Area Fill**: Light gray with transparency
- **Current Price Line**: Black dotted line
- **Price Label**: Black background with white text

## Layout Structure

### Main Layout (3-Column)
1. **Left Sidebar** (250px)
   - Market categories (Derived, Forex, Stock Indices, etc.)
   - Symbol list with search
   - Collapsible sections
   - White background

2. **Center Area** (Flexible)
   - Chart takes full height
   - Symbol header at top (symbol name, current price, change %)
   - Chart controls below header (timeframe, chart type)
   - Stats bar at bottom

3. **Right Panel** (320px)
   - Trade type selector at top
   - Trade parameters (stake, duration, etc.)
   - Buy/Sell buttons
   - Contract details
   - White background with subtle borders

### Header
- Deriv logo (red circle with white "d")
- Minimal, clean design
- Login/Sign up buttons (red)
- Account switcher
- Light background

## Typography

- **Font Family**: IBM Plex Sans (primary), sans-serif
- **Symbol Name**: 14px, bold
- **Price**: 16px, bold
- **Labels**: 12px, regular
- **Buttons**: 14px, medium weight

## Components

### Market Selector (Left Sidebar)
- Tabs: Markets, Favorites
- Categories expand/collapse
- Symbol items show name only
- Hover state: light gray background
- Active: subtle highlight

### Chart Area
- Clean, minimal design
- White background
- Light grid lines
- Area chart with gray fill
- Current price: horizontal dotted line
- Price scale on right
- Time scale at bottom
- Stats bar below chart

### Trade Panel (Right)
- **Trade Type Selector**: Horizontal tabs (Accumulators, Rise/Fall, etc.)
- **Growth Rate**: Pill-shaped buttons (1%, 2%, 3%, etc.)
- **Stake Input**: Large input with +/- buttons, currency dropdown
- **Take Profit**: Toggle switch, input field
- **Max Payout/Ticks**: Display only, gray background
- **Buy Button**: Full width, teal (#4BB4B3), large

### Buttons
- **Primary (Red)**: #FF444F, white text, rounded corners (4px)
- **Buy (Teal)**: #4BB4B3, white text
- **Sell (Red)**: #FF444F, white text
- **Secondary**: White with gray border
- **Hover**: Slightly darker shade
- **Disabled**: Gray with reduced opacity

### Inputs
- White background
- Gray border (#E6E9E9)
- Rounded corners (4px)
- Focus: Blue border
- +/- buttons integrated

## Key Design Principles

1. **Clean & Minimal**: Lots of white space, no clutter
2. **Professional**: Corporate feel, not flashy
3. **Functional**: Everything has a purpose
4. **Consistent**: Same spacing, colors, patterns throughout
5. **Accessible**: Good contrast, clear labels
6. **Responsive**: Adapts to screen size

## Spacing

- **Panel Padding**: 16px
- **Section Spacing**: 20px
- **Element Spacing**: 12px
- **Input Height**: 40px
- **Button Height**: 48px (primary), 40px (secondary)

## Borders & Shadows

- **Border Radius**: 4px (buttons, inputs), 8px (cards)
- **Border Color**: #E6E9E9 (light gray)
- **Shadows**: Minimal, subtle (0 2px 4px rgba(0,0,0,0.1))

## Chart Specifics

- **Type**: Area chart (default)
- **Fill**: Gray gradient
- **Line**: Dark gray
- **Grid**: Very subtle, light gray
- **Crosshair**: Dotted lines
- **Tooltip**: White card with shadow
- **Timeframe**: 1T (1 tick) default
- **Controls**: Icon buttons, minimal style
