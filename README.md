# Art of Infra - Subnet Calculator

A professional subnet calculator built with Next.js and shadcn/ui for network engineers and IT professionals. Deployed on Cloudflare Pages for fast, global access.

## Features

- **Real-time Calculation**: Automatically calculates subnet information as you type
- **Dual Mode Support**:
  - **Normal Mode**: Standard subnetting calculations
  - **AWS VPC Mode**: AWS-specific calculations with reserved IP addresses
- **Comprehensive Results**: Shows network address, broadcast address, host ranges, subnet masks, and more
- **AWS Reserved IPs**: In AWS mode, displays the 5 IP addresses AWS reserves in every subnet
- **Input Validation**: Validates IP addresses and CIDR notation (AWS mode enforces /16-/28 range)
- **Professional UI**: Clean, responsive design using shadcn/ui components
- **Mobile Friendly**: Works seamlessly on desktop and mobile devices

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

1. Enter an IP address (e.g., `192.168.1.0`)
2. Enter a CIDR prefix (e.g., `24`)
3. The calculator will automatically display all subnet information

## Examples

### Normal Mode

- `192.168.1.0/24` - Standard Class C network (254 usable hosts)
- `10.0.0.0/8` - Class A private network
- `172.16.0.0/12` - Class B private network range
- `192.168.1.0/28` - Smaller subnet with 14 usable hosts

### AWS VPC Mode

- `10.0.1.0/24` - AWS subnet with 251 usable hosts (5 reserved by AWS)
- `172.31.0.0/20` - Default VPC subnet range
- `10.0.0.0/28` - Small AWS subnet with 11 usable hosts
- Shows AWS reserved IPs: .0 (network), .1 (VPC router), .2 (DNS), .3 (future use), .255 (broadcast)

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
