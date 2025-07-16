"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ThemeToggle } from "@/components/theme-toggle";
import { Github, Newspaper } from "lucide-react";
import { useTheme } from "next-themes";
import Image from "next/image";

// Types
type CloudMode = "normal" | "aws" | "azure" | "gcp";

interface CloudReservation {
  ip: string;
  purpose: string;
  description: string;
}

interface SubnetInfo {
  network: string;
  broadcast: string;
  firstHost: string;
  lastHost: string;
  subnetMask: string;
  wildcardMask: string;
  totalHosts: number;
  usableHosts: number;
  cidr: string;
  cloudReserved?: {
    provider: string;
    reservations: CloudReservation[];
  };
}

interface CloudProviderConfig {
  name: string;
  minCidr: number;
  maxCidr: number;
  reservedCount: number;
  firstUsableOffset: number;
  getReservations: (networkInt: number, broadcastInt: number, intToIp: (int: number) => string) => CloudReservation[];
}

// Cloud provider configurations
const CLOUD_PROVIDERS: Record<Exclude<CloudMode, "normal">, CloudProviderConfig> = {
  aws: {
    name: "AWS",
    minCidr: 16,
    maxCidr: 28,
    reservedCount: 5,
    firstUsableOffset: 4,
    getReservations: (networkInt, broadcastInt, intToIp) => [
      { ip: intToIp(networkInt), purpose: "Network Address", description: "Network identifier (not assignable)" },
      { ip: intToIp(networkInt + 1), purpose: "VPC Router", description: "Reserved for the VPC router" },
      { ip: intToIp(networkInt + 2), purpose: "DNS Server", description: "Reserved for DNS server" },
      { ip: intToIp(networkInt + 3), purpose: "Future Use", description: "Reserved for future use" },
      { ip: intToIp(broadcastInt), purpose: "Broadcast Address", description: "Network broadcast address (not assignable)" }
    ]
  },
  azure: {
    name: "Azure",
    minCidr: 8,
    maxCidr: 29,
    reservedCount: 5,
    firstUsableOffset: 4,
    getReservations: (networkInt, broadcastInt, intToIp) => [
      { ip: intToIp(networkInt), purpose: "Network Address", description: "Network identifier (not assignable)" },
      { ip: intToIp(networkInt + 1), purpose: "Default Gateway", description: "Reserved for default gateway" },
      { ip: intToIp(networkInt + 2), purpose: "DNS Mapping", description: "Reserved for Azure DNS" },
      { ip: intToIp(networkInt + 3), purpose: "DNS Mapping", description: "Reserved for Azure DNS" },
      { ip: intToIp(broadcastInt), purpose: "Broadcast Address", description: "Network broadcast address (not assignable)" }
    ]
  },
  gcp: {
    name: "Google Cloud",
    minCidr: 8,
    maxCidr: 29,
    reservedCount: 4,
    firstUsableOffset: 2,
    getReservations: (networkInt, broadcastInt, intToIp) => [
      { ip: intToIp(networkInt), purpose: "Network Address", description: "Network identifier (not assignable)" },
      { ip: intToIp(networkInt + 1), purpose: "Default Gateway", description: "Reserved for default gateway" },
      { ip: intToIp(broadcastInt - 1), purpose: "Second-to-last IP", description: "Reserved by Google Cloud" },
      { ip: intToIp(broadcastInt), purpose: "Broadcast Address", description: "Network broadcast address (not assignable)" }
    ]
  }
};

export default function SubnetCalculator() {
  const [ipAddress, setIpAddress] = useState("192.168.1.0");
  const [cidr, setCidr] = useState("24");
  const [mode, setMode] = useState("normal");
  const [subnetInfo, setSubnetInfo] = useState<SubnetInfo | null>(null);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);
  const { theme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  const validateIP = (ip: string): boolean => {
    const parts = ip.split(".");
    if (parts.length !== 4) return false;
    return parts.every(part => {
      const num = parseInt(part);
      return !isNaN(num) && num >= 0 && num <= 255;
    });
  };

  const validateCIDR = useCallback((cidr: string): boolean => {
    const num = parseInt(cidr);
    if (isNaN(num)) return false;

    if (mode === "normal") {
      return num >= 0 && num <= 32;
    }

    const provider = CLOUD_PROVIDERS[mode as keyof typeof CLOUD_PROVIDERS];
    return provider ? num >= provider.minCidr && num <= provider.maxCidr : false;
  }, [mode]);

  const ipToInt = (ip: string): number => {
    return ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
  };

  const intToIp = (int: number): string => {
    return [
      (int >>> 24) & 255,
      (int >>> 16) & 255,
      (int >>> 8) & 255,
      int & 255
    ].join(".");
  };

  const calculateSubnet = useCallback(() => {
    setError("");

    if (!validateIP(ipAddress)) {
      setError("Invalid IP address format");
      return;
    }

    if (!validateCIDR(cidr)) {
      if (mode === "normal") {
        setError("CIDR must be between 0 and 32");
      } else {
        const provider = CLOUD_PROVIDERS[mode as keyof typeof CLOUD_PROVIDERS];
        if (provider) {
          const minHosts = Math.pow(2, 32 - provider.maxCidr);
          setError(`${provider.name} subnets require CIDR between /${provider.minCidr} and /${provider.maxCidr} (minimum ${minHosts} IP addresses)`);
        }
      }
      return;
    }

    const cidrNum = parseInt(cidr);
    const hostBits = 32 - cidrNum;
    const subnetMask = (0xFFFFFFFF << hostBits) >>> 0;
    const wildcardMask = ~subnetMask >>> 0;

    const ipInt = ipToInt(ipAddress);
    const networkInt = (ipInt & subnetMask) >>> 0;
    const broadcastInt = (networkInt | wildcardMask) >>> 0;

    const totalHosts = Math.pow(2, hostBits);
    let usableHosts = hostBits <= 1 ? 0 : totalHosts - 2;

    const firstHostInt = networkInt + 1;
    const lastHostInt = broadcastInt - 1;

    let cloudReserved = undefined;
    let firstUsableHost = intToIp(firstHostInt);

    // Apply cloud provider specific reservations
    if (mode !== "normal") {
      const provider = CLOUD_PROVIDERS[mode as keyof typeof CLOUD_PROVIDERS];
      if (provider) {
        usableHosts = totalHosts - provider.reservedCount;
        firstUsableHost = intToIp(networkInt + provider.firstUsableOffset);
        cloudReserved = {
          provider: provider.name,
          reservations: provider.getReservations(networkInt, broadcastInt, intToIp)
        };
      }
    }

    setSubnetInfo({
      network: intToIp(networkInt),
      broadcast: intToIp(broadcastInt),
      firstHost: hostBits <= 1 ? "N/A" : firstUsableHost,
      lastHost: hostBits <= 1 ? "N/A" : intToIp(lastHostInt),
      subnetMask: intToIp(subnetMask),
      wildcardMask: intToIp(wildcardMask),
      totalHosts,
      usableHosts: Math.max(0, usableHosts),
      cidr: `/${cidr}`,
      cloudReserved
    });
  }, [ipAddress, cidr, mode, validateCIDR]);

  useEffect(() => {
    if (ipAddress && cidr) {
      calculateSubnet();
    }
  }, [ipAddress, cidr, mode, calculateSubnet]);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Top navigation bar with logo and buttons */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center">
          {mounted && (
            <Image
              src={theme === 'dark' ? '/aio_logo_dark.png' : '/aio_logo_light.png'}
              alt="Art of Infra Logo"
              width={120}
              height={40}
              className="h-10 w-auto"
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            asChild
          >
            <a
              href="https://artofinfra.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Visit Art of Infra blog"
            >
              <Newspaper className="h-4 w-4" />
            </a>
          </Button>
          <Button
            variant="outline"
            size="icon"
            asChild
          >
            <a
              href="https://github.com/danjonesio/AoI-Subnet-Calculator"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View source on GitHub"
            >
              <Github className="h-4 w-4" />
            </a>
          </Button>
          <ThemeToggle />
        </div>
      </div>

      {/* Main header section */}
      <div className="text-center space-y-2 mb-6">
        <h1 className="text-3xl font-bold">Subnet Calculator</h1>
        <p className="text-muted-foreground">
          Network planning tool for general networking, AWS, Azure and Google Cloud.
        </p>
        <p className="text-sm text-muted-foreground">
          From Dan Jones at the <a href="https://artofinfra.com" className="text-primary hover:text-primary/80 hover:underline" target="_blank" rel="noopener noreferrer">artofinfra.com</a> blog
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Network Input</CardTitle>
          <CardDescription>
            Enter an IP address and CIDR notation to calculate subnet details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2 flex-1">
              <Label htmlFor="ip">IP Address</Label>
              <Input
                id="ip"
                type="text"
                placeholder="192.168.1.0"
                value={ipAddress}
                onChange={(e) => setIpAddress(e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2 flex-1">
              <Label htmlFor="cidr">CIDR Prefix</Label>
              <Input
                id="cidr"
                type="number"
                min="0"
                max={mode === "normal" ? "32" : CLOUD_PROVIDERS[mode as keyof typeof CLOUD_PROVIDERS]?.maxCidr || "32"}
                placeholder="24"
                value={cidr}
                onChange={(e) => setCidr(e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2 flex-1">
              <Label htmlFor="mode">Mode</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal Subnetting</SelectItem>
                  <SelectItem value="aws">AWS VPC Mode</SelectItem>
                  <SelectItem value="azure">Azure VNet Mode</SelectItem>
                  <SelectItem value="gcp">Google Cloud VPC Mode</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && (
            <div className="text-red-500 text-sm">{error}</div>
          )}

          <Button onClick={calculateSubnet} className="w-full">
            Calculate Subnet
          </Button>
        </CardContent>
      </Card>

      {subnetInfo && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Subnet Information</CardTitle>
              <CardDescription>
                Calculated network details for {ipAddress}/{cidr} {mode !== "normal" && `(${CLOUD_PROVIDERS[mode as keyof typeof CLOUD_PROVIDERS]?.name} Mode)`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Property</TableHead>
                    <TableHead>Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Network Address</TableCell>
                    <TableCell>{subnetInfo.network}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Broadcast Address</TableCell>
                    <TableCell>{subnetInfo.broadcast}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">First Host</TableCell>
                    <TableCell>{subnetInfo.firstHost}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Last Host</TableCell>
                    <TableCell>{subnetInfo.lastHost}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Subnet Mask</TableCell>
                    <TableCell>{subnetInfo.subnetMask}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Wildcard Mask</TableCell>
                    <TableCell>{subnetInfo.wildcardMask}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Total Hosts</TableCell>
                    <TableCell>{subnetInfo.totalHosts.toLocaleString()}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Usable Hosts</TableCell>
                    <TableCell>{subnetInfo.usableHosts.toLocaleString()}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">CIDR Notation</TableCell>
                    <TableCell>{subnetInfo.network}{subnetInfo.cidr}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {subnetInfo.cloudReserved && (
            <Card>
              <CardHeader>
                <CardTitle>{subnetInfo.cloudReserved.provider} Reserved IP Addresses</CardTitle>
                <CardDescription>
                  {subnetInfo.cloudReserved.provider} automatically reserves these IP addresses in every subnet
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>IP Address</TableHead>
                      <TableHead>Purpose</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subnetInfo.cloudReserved.reservations.map((reservation, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-mono">{reservation.ip}</TableCell>
                        <TableCell className="font-medium">{reservation.purpose}</TableCell>
                        <TableCell>{reservation.description}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}