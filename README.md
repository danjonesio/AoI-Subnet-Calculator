# Art of Infra - Subnet Calculator

A professional subnet calculator built with Next.js and shadcn/ui for network engineers and IT professionals. Deployed on Cloudflare Pages for fast, global access.

## Features

### Core Calculator
- **Real-time Calculation**: Automatically calculates subnet information as you type
- **Multi-Cloud Support**:
  - **Normal Mode**: Standard subnetting calculations
  - **AWS VPC Mode**: AWS-specific calculations with reserved IP addresses
  - **Azure VNet Mode**: Azure-specific calculations with reserved IP addresses
  - **Google Cloud VPC Mode**: GCP-specific calculations with reserved IP addresses
- **IPv4 & IPv6 Support**: Full support for both IPv4 and IPv6 subnet calculations
- **Comprehensive Results**: Shows network address, broadcast address, host ranges, subnet masks, and more
- **Cloud Reserved IPs**: Displays provider-specific reserved IP addresses in each subnet
- **Input Validation**: Validates IP addresses and CIDR notation with provider-specific constraints

### Advanced Subnet Management
- **Interactive Subnet Splitting**: Split calculated subnets into smaller networks
  - Equal splits (halves, quarters, eighths)
  - Custom CIDR-based splits
  - Cloud provider constraint validation
  - Real-time split preview
- **Subnet Joining**: Combine adjacent subnets back into larger networks
  - Automatic adjacency detection
  - Multi-subnet selection
  - Join validation and preview
- **Visual Management**: 
  - Hierarchical tree view of subnet relationships
  - Sortable table view with detailed information
  - Performance-optimized rendering for large subnet lists
- **Export & Copy**: Export subnet data in multiple formats (JSON, CSV, formatted text)
- **Performance Optimization**: Memoization, progressive calculation, and virtual scrolling

### User Experience
- **Professional UI**: Clean, responsive design using shadcn/ui components
- **Dark/Light Theme**: Automatic theme switching with system preference detection
- **Mobile Friendly**: Works seamlessly on desktop and mobile devices
- **Accessibility**: Full keyboard navigation and screen reader support
- **Error Handling**: Comprehensive error boundaries and user-friendly error messages

## What it Calculates

- Network Address
- Broadcast Address
- First and Last Host IP
- Subnet Mask (dotted decimal)
- Wildcard Mask
- Total Hosts
- Usable Hosts
- CIDR Notation

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:

   ```bash
   npm install
   ```

3. Run the development server:

   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

### Testing

To run the test suite:

```bash
npm test
```

The project includes comprehensive tests for subnet calculation functions, including IPv4 and IPv6 subnet splitting and joining operations.

### Building for Production

To build the static export for deployment:

```bash
npm run build
```

This creates an `out` directory with static files ready for deployment.

### Local Testing of Production Build

To test the production build locally:

```bash
# Build the project
npm run build

# Serve the static files
cd out
python3 -m http.server 8000
# or
npx serve . -p 8000
```

Then visit [http://localhost:8000](http://localhost:8000)

## Deployment

The live project is configured for deployment on Cloudflare Pages with static export.

### Cloudflare Pages Configuration

- **Build command**: `npm run build`
- **Build outpout**: `out`
- **Root directory**: `/`

The project uses Next.js static export (`output: 'export'`) to generate static files that work perfectly with Cloudflare Pages' edge network.

### Other Static Hosting Platforms

The built `out` directory can be deployed to any static hosting service:
- Vercel
- Netlify  
- GitHub Pages
- AWS S3 + CloudFront
- Any CDN or web server

## Usage

### Basic Calculator

1. Enter an IP address (e.g., `192.168.1.0`)
2. Enter a CIDR prefix (e.g., `24`)
3. Select cloud provider mode if needed (Normal, AWS, Azure, GCP)
4. The calculator will automatically display all subnet information

### Advanced Subnet Management

Once you have calculated a subnet, the Advanced Subnet Management section appears below the results, providing interactive tools for subnet manipulation.

#### Splitting Subnets

1. **Quick Splits**: Use the dropdown to select common split options:
   - Split in Half (2 subnets)
   - Split in Quarters (4 subnets)
   - Split in Eighths (8 subnets)

2. **Custom Splits**: Select "Custom Split" and enter a target CIDR:
   - Must be more specific than the parent subnet
   - Example: Split a /24 into /26 subnets (4 subnets)

3. **Preview**: The interface shows how many subnets will be created before you confirm

4. **Execute**: Click "Split Subnet" to generate the split subnets

#### Joining Subnets

1. **Select Subnets**: Use checkboxes to select adjacent subnets you want to join
2. **Validation**: The system automatically validates that selected subnets can be joined:
   - Must be adjacent in address space
   - Must be the same size (same CIDR)
   - Must be at the same hierarchy level
3. **Join**: Click "Join Selected Subnets" to combine them into a larger subnet

#### Viewing Subnet Information

- **Table View**: Sortable table showing all subnet details
- **Tree View**: Hierarchical view showing parent-child relationships
- **Export Options**: Copy individual subnets or export all data in JSON/CSV format

#### Resetting Changes

- Use the "Reset" button to return to the original calculated subnet
- All splits and joins will be cleared

## Examples

### Basic Subnet Calculations

#### Normal Mode
- `192.168.1.0/24` - Standard Class C network (254 usable hosts)
- `10.0.0.0/8` - Class A private network
- `172.16.0.0/12` - Class B private network range
- `192.168.1.0/28` - Smaller subnet with 14 usable hosts

#### IPv6 Examples
- `2001:db8::/32` - IPv6 network with massive address space
- `fe80::/64` - Link-local IPv6 network
- `2001:db8:1::/48` - Typical IPv6 site allocation

#### Cloud Provider Modes

**AWS VPC Mode**
- `10.0.1.0/24` - AWS subnet with 251 usable hosts (5 reserved by AWS)
- `172.31.0.0/20` - Default VPC subnet range
- `10.0.0.0/28` - Small AWS subnet with 11 usable hosts
- Shows AWS reserved IPs: .0 (network), .1 (VPC router), .2 (DNS), .3 (future use), .255 (broadcast)

**Azure VNet Mode**
- `10.1.0.0/24` - Azure subnet with 251 usable hosts (5 reserved by Azure)
- `192.168.0.0/16` - Large Azure VNet
- Shows Azure reserved IPs: .0 (network), .1 (gateway), .2/.3 (DNS), .255 (broadcast)

**Google Cloud VPC Mode**
- `10.2.0.0/24` - GCP subnet with 252 usable hosts (4 reserved by GCP)
- `172.16.0.0/12` - GCP VPC network
- Shows GCP reserved IPs: .0 (network), .1 (gateway), .254 (reserved), .255 (broadcast)

### Advanced Subnet Management Workflows

#### Workflow 1: Network Segmentation for Multi-Tier Architecture

1. **Start with a large subnet**: `10.0.0.0/22` (1024 hosts)
2. **Split into quarters** for different tiers:
   - `10.0.0.0/24` - Web tier (254 hosts)
   - `10.0.1.0/24` - Application tier (254 hosts)
   - `10.0.2.0/24` - Database tier (254 hosts)
   - `10.0.3.0/24` - Management tier (254 hosts)
3. **Further split web tier** for load balancing:
   - Split `10.0.0.0/24` into `/26` subnets (4 subnets, 62 hosts each)

#### Workflow 2: Cloud Multi-AZ Deployment

1. **Start with VPC CIDR**: `10.1.0.0/16` in AWS mode
2. **Split into /20 subnets** for availability zones (16 subnets)
3. **Split each AZ subnet** into public/private pairs:
   - Public: `10.1.0.0/24` (251 usable hosts)
   - Private: `10.1.1.0/24` (251 usable hosts)
4. **Export configuration** for infrastructure as code

#### Workflow 3: IPv6 Network Planning

1. **Start with IPv6 allocation**: `2001:db8::/48`
2. **Split into /64 subnets** for different VLANs (65,536 subnets available)
3. **Use tree view** to visualize the hierarchical structure
4. **Join adjacent subnets** if consolidation is needed

#### Workflow 4: Subnet Consolidation

1. **Start with over-segmented network**: Multiple small `/28` subnets
2. **Select adjacent subnets** using checkboxes
3. **Join them** into larger `/26` or `/25` subnets
4. **Validate** that the consolidation meets requirements
5. **Reset if needed** to try different consolidation strategies

## Performance Considerations

### Calculation Performance

The subnet calculator is optimized for performance with several key features:

- **Memoization**: Identical subnet calculations are cached for 5 minutes
- **Progressive Calculation**: Large subnet operations are processed incrementally
- **Debounced Input**: Input validation is debounced to prevent excessive calculations
- **Performance Monitoring**: Automatic warnings for operations that may impact performance

### Performance Thresholds

- **Split Operations**: 
  - Up to 256 subnets: Instant calculation
  - 256-1000 subnets: Progressive calculation with loading indicator
  - 1000+ subnets: Performance warning displayed
- **Rendering Optimization**:
  - Virtual scrolling for lists with 100+ subnets
  - React.memo optimization for subnet row components
  - Lazy loading for detailed subnet information

### Memory Management

- **Cache Cleanup**: Automatic cleanup of unused calculation cache entries
- **Efficient Data Structures**: Optimized for large IPv6 address spaces using BigInt
- **Garbage Collection**: Proper cleanup when resetting or changing calculations

### Best Practices for Large Operations

1. **Use Progressive Splits**: Instead of splitting a /16 directly to /24, split incrementally (/16 → /20 → /24)
2. **Limit Concurrent Operations**: Avoid multiple large split operations simultaneously
3. **Use Filtering**: When working with many subnets, use the search/filter functionality
4. **Export Large Datasets**: For very large subnet lists, export to external tools for analysis

## Limitations

### Technical Limitations

- **Maximum Subnets**: Hard limit of 10,000 subnets per calculation to prevent browser crashes
- **IPv4 CIDR Range**: /0 to /32 (standard IPv4 limitations)
- **IPv6 CIDR Range**: /0 to /128 (standard IPv6 limitations)
- **Browser Memory**: Large operations limited by available browser memory

### Cloud Provider Constraints

- **AWS VPC**: CIDR blocks limited to /16 - /28 range
- **Azure VNet**: CIDR blocks limited to /8 - /29 range  
- **Google Cloud VPC**: CIDR blocks limited to /8 - /29 range
- **Reserved IPs**: Cloud provider reserved IPs cannot be modified or used

### UI Limitations

- **Mobile Performance**: Complex operations may be slower on mobile devices
- **Screen Size**: Tree view may be difficult to navigate on very small screens
- **Export Size**: Large exports may be limited by browser download capabilities

## Troubleshooting Guide

### Common Issues and Solutions

#### "Invalid split configuration" Error

**Problem**: Error when trying to split a subnet

**Possible Causes**:
- Target CIDR is not more specific than parent (e.g., trying to split /24 into /22)
- Target CIDR exceeds maximum (32 for IPv4, 128 for IPv6)
- Cloud provider constraints violated

**Solutions**:
1. Ensure target CIDR is larger number than parent (e.g., /24 → /26)
2. Check cloud provider CIDR limits in the selected mode
3. Verify the parent subnet has enough address space for the split

#### "Subnets cannot be joined" Error

**Problem**: Selected subnets cannot be combined

**Possible Causes**:
- Subnets are not adjacent in address space
- Subnets are different sizes (different CIDR values)
- Subnets are at different hierarchy levels

**Solutions**:
1. Select only adjacent subnets (consecutive IP ranges)
2. Ensure all selected subnets have the same CIDR prefix length
3. Only join subnets that were created from the same parent split

#### Performance Issues

**Problem**: Calculator becomes slow or unresponsive

**Possible Causes**:
- Very large subnet operations (1000+ subnets)
- Multiple concurrent calculations
- Browser memory limitations

**Solutions**:
1. Use smaller, incremental splits instead of large operations
2. Clear browser cache and reload the page
3. Close other browser tabs to free memory
4. Use the "Reset" button to clear current calculations

#### Export/Copy Not Working

**Problem**: Export or copy functionality fails

**Possible Causes**:
- Browser clipboard permissions
- Large dataset size
- Browser security restrictions

**Solutions**:
1. Grant clipboard permissions when prompted
2. Try exporting smaller subsets of data
3. Use "Copy Individual" instead of "Copy All" for large datasets
4. Try a different browser if issues persist

#### IPv6 Display Issues

**Problem**: IPv6 addresses not displaying correctly

**Possible Causes**:
- Browser IPv6 support limitations
- Invalid IPv6 input format
- IPv6 compression/expansion issues

**Solutions**:
1. Ensure IPv6 address is in valid format (e.g., 2001:db8::1)
2. Use standard IPv6 notation (avoid mixed IPv4/IPv6 formats)
3. Try using compressed or expanded format if one doesn't work

#### Theme/Display Issues

**Problem**: Interface appears broken or incorrectly styled

**Possible Causes**:
- Theme switching conflicts
- Browser cache issues
- CSS loading problems

**Solutions**:
1. Try switching between light/dark themes
2. Hard refresh the page (Ctrl+F5 or Cmd+Shift+R)
3. Clear browser cache and cookies
4. Disable browser extensions that might interfere with CSS

### Getting Help

If you encounter issues not covered in this guide:

1. **Check Browser Console**: Open developer tools (F12) and check for error messages
2. **Try Different Browser**: Test in Chrome, Firefox, Safari, or Edge
3. **Reduce Complexity**: Try with smaller, simpler subnet operations
4. **Report Issues**: Create an issue on the project repository with:
   - Browser and version
   - Steps to reproduce
   - Error messages from console
   - Example IP/CIDR that causes the issue

## Tech Stack

- **Next.js 15** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **shadcn/ui** - UI components
- **React Hooks** - State management

## Perfect for

- Network engineers planning subnets
- IT professionals designing networks
- Students learning networking concepts
- Anyone needing quick subnet calculations

## License

MIT License - feel free to use this for your networking projects!
