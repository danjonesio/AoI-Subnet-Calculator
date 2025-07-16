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
  awsReserved?: {
    networkAddress: string;
    vpcRouter: string;
    dnsServer: string;
    futureUse: string;
    broadcast: string;
  };
}

export default function SubnetCalculator() {
  const [ipAddress, setIpAddress] = useState("192.168.1.0");
  const [cidr, setCidr] = useState("24");
  const [mode, setMode] = useState("normal");
  const [subnetInfo, setSubnetInfo] = useState<SubnetInfo | null>(null);
  const [error, setError] = useState("");

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
    if (mode === "aws") {
      // AWS VPC subnets must have at least 16 IP addresses (minimum /28)
      return !isNaN(num) && num >= 16 && num <= 28;
    }
    return !isNaN(num) && num >= 0 && num <= 32;
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
      if (mode === "aws") {
        setError("AWS VPC subnets require CIDR between /16 and /28 (minimum 16 IP addresses)");
      } else {
        setError("CIDR must be between 0 and 32");
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

    let awsReserved = undefined;
    if (mode === "aws") {
      // AWS reserves the first 4 IPs and the last IP in each subnet
      usableHosts = totalHosts - 5; // Network + 3 AWS reserved + Broadcast
      awsReserved = {
        networkAddress: intToIp(networkInt), // .0 - Network address
        vpcRouter: intToIp(networkInt + 1), // .1 - VPC router
        dnsServer: intToIp(networkInt + 2), // .2 - DNS server
        futureUse: intToIp(networkInt + 3), // .3 - Reserved for future use
        broadcast: intToIp(broadcastInt) // Last IP - Broadcast address
      };
    }

    setSubnetInfo({
      network: intToIp(networkInt),
      broadcast: intToIp(broadcastInt),
      firstHost: hostBits <= 1 ? "N/A" : mode === "aws" ? intToIp(networkInt + 4) : intToIp(firstHostInt),
      lastHost: hostBits <= 1 ? "N/A" : intToIp(lastHostInt),
      subnetMask: intToIp(subnetMask),
      wildcardMask: intToIp(wildcardMask),
      totalHosts,
      usableHosts: Math.max(0, usableHosts),
      cidr: `/${cidr}`,
      awsReserved
    });
  }, [ipAddress, cidr, mode, validateCIDR]);

  useEffect(() => {
    if (ipAddress && cidr) {
      calculateSubnet();
    }
  }, [ipAddress, cidr, mode, calculateSubnet]);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-start mb-6">
        <div className="text-center flex-1 space-y-2">
          <h1 className="text-3xl font-bold">Art of Infra - Subnet Calculator</h1>
          <p className="text-muted-foreground">
            Network planning tool for engineers and IT professionals
          </p>
          <p className="text-sm text-muted-foreground">
            From Dan Jones at the <a href="https://artofinfra.com" className="text-primary hover:text-primary/80 hover:underline" target="_blank" rel="noopener noreferrer">artofinfra.com</a> blog
          </p>
        </div>
        <div className="ml-4 flex items-center gap-2">
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
                max={mode === "aws" ? "28" : "32"}
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
                Calculated network details for {ipAddress}/{cidr} {mode === "aws" && "(AWS VPC Mode)"}
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

          {mode === "aws" && subnetInfo.awsReserved && (
            <Card>
              <CardHeader>
                <CardTitle>AWS Reserved IP Addresses</CardTitle>
                <CardDescription>
                  AWS automatically reserves these IP addresses in every VPC subnet
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
                    <TableRow>
                      <TableCell className="font-mono">{subnetInfo.awsReserved.networkAddress}</TableCell>
                      <TableCell className="font-medium">Network Address</TableCell>
                      <TableCell>Network identifier (not assignable)</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-mono">{subnetInfo.awsReserved.vpcRouter}</TableCell>
                      <TableCell className="font-medium">VPC Router</TableCell>
                      <TableCell>Reserved for the VPC router</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-mono">{subnetInfo.awsReserved.dnsServer}</TableCell>
                      <TableCell className="font-medium">DNS Server</TableCell>
                      <TableCell>Reserved for DNS server</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-mono">{subnetInfo.awsReserved.futureUse}</TableCell>
                      <TableCell className="font-medium">Future Use</TableCell>
                      <TableCell>Reserved for future use</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-mono">{subnetInfo.awsReserved.broadcast}</TableCell>
                      <TableCell className="font-medium">Broadcast Address</TableCell>
                      <TableCell>Network broadcast address (not assignable)</TableCell>
                    </TableRow>
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