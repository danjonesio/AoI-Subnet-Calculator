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
import { validateIPv6, compressIPv6, validateIPv6CIDR, calculateIPv6Subnet, getIPv6SubnetSummary } from "@/lib/utils";
import { 
  CloudMode, 
  IPVersion, 
  SplitSubnet, 
  SubnetOperation,
  SubnetError
} from "@/lib/types";
import { SubnetSplitter } from "@/components/subnet-management/subnet-splitter";
import { SubnetJoiner } from "@/components/subnet-management/subnet-joiner";
import { SubnetTree } from "@/components/subnet-management/subnet-tree";

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
  ipv6Info?: {
    addressType: string;
    hostBits: number;
    totalAddressesFormatted: string;
    usableAddressesFormatted: string;
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
  const [ipVersion, setIpVersion] = useState<IPVersion>("ipv4");
  const [subnetInfo, setSubnetInfo] = useState<SubnetInfo | null>(null);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);
  const { theme } = useTheme();

  // Subnet Management State - Enhanced for advanced subnet management
  const [splitSubnets, setSplitSubnets] = useState<SplitSubnet[]>([]);
  const [selectedSubnets, setSelectedSubnets] = useState<Set<string>>(new Set());
  const [splitHistory, setSplitHistory] = useState<SubnetOperation[]>([]);
  const [isSubnetLoading, setIsSubnetLoading] = useState(false);
  const [subnetError, setSubnetError] = useState<string | null>(null);
  
  // Additional state for enhanced subnet management
  const [originalSubnet, setOriginalSubnet] = useState<SubnetInfo | null>(null);
  const [currentView, setCurrentView] = useState<'list' | 'tree'>('list');
  const [sortBy, setSortBy] = useState<'network' | 'cidr' | 'hosts' | 'created'>('network');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [filterText, setFilterText] = useState<string>('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  useEffect(() => {
    setMounted(true);
  }, []);

  const validateIP = useCallback((ip: string): boolean => {
    if (ipVersion === "ipv4") {
      const parts = ip.split(".");
      if (parts.length !== 4) return false;
      return parts.every(part => {
        const num = parseInt(part);
        return !isNaN(num) && num >= 0 && num <= 255;
      });
    } else {
      return validateIPv6(ip);
    }
  }, [ipVersion]);

  const validateCIDR = useCallback((cidr: string): boolean => {
    const num = parseInt(cidr);
    if (isNaN(num)) return false;

    if (ipVersion === "ipv6") {
      return validateIPv6CIDR(cidr);
    }

    if (mode === "normal") {
      return num >= 0 && num <= 32;
    }

    const provider = CLOUD_PROVIDERS[mode as keyof typeof CLOUD_PROVIDERS];
    return provider ? num >= provider.minCidr && num <= provider.maxCidr : false;
  }, [mode, ipVersion]);

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

  // Subnet Management State Update Functions - Enhanced for task 4.2
  const addSplitSubnets = useCallback((newSubnets: SplitSubnet[], operation: SubnetOperation) => {
    setIsSubnetLoading(true);
    try {
      if (operation.type === 'split') {
        // For split operations, replace existing subnets to avoid duplicates
        // This handles the case where user clicks "Split Subnets" multiple times
        setSplitSubnets(newSubnets);
        // Clear selection since we're replacing all subnets
        setSelectedSubnets(new Set());
      } else {
        // For other operations (like join results), append to existing
        setSplitSubnets(prev => [...prev, ...newSubnets]);
      }
      setSplitHistory(prev => [...prev, operation]);
      setSubnetError(null);
    } catch (error) {
      setSubnetError(error instanceof Error ? error.message : 'Failed to add split subnets');
    } finally {
      setIsSubnetLoading(false);
    }
  }, []);

  const removeSubnets = useCallback((subnetIds: string[], operation: SubnetOperation) => {
    setIsSubnetLoading(true);
    try {
      setSplitSubnets(prev => prev.filter(subnet => !subnetIds.includes(subnet.id)));
      setSelectedSubnets(prev => {
        const newSelected = new Set(prev);
        subnetIds.forEach(id => newSelected.delete(id));
        return newSelected;
      });
      setSplitHistory(prev => [...prev, operation]);
      setSubnetError(null);
    } catch (error) {
      setSubnetError(error instanceof Error ? error.message : 'Failed to remove subnets');
    } finally {
      setIsSubnetLoading(false);
    }
  }, []);

  const toggleSubnetSelection = useCallback((subnetId: string) => {
    try {
      setSelectedSubnets(prev => {
        const newSelected = new Set(prev);
        if (newSelected.has(subnetId)) {
          newSelected.delete(subnetId);
        } else {
          newSelected.add(subnetId);
        }
        return newSelected;
      });
    } catch (error) {
      setSubnetError(error instanceof Error ? error.message : 'Failed to toggle subnet selection');
    }
  }, []);

  const resetSubnetManagement = useCallback(() => {
    try {
      setSplitSubnets([]);
      setSelectedSubnets(new Set());
      setSplitHistory([]);
      setIsSubnetLoading(false);
      setSubnetError(null);
      setOriginalSubnet(null);
      setCurrentView('list');
      setSortBy('network');
      setSortOrder('asc');
      setFilterText('');
      setExpandedNodes(new Set());
    } catch (error) {
      console.error('Error resetting subnet management:', error);
      setSubnetError('Failed to reset subnet management');
    }
  }, []);

  // Additional state management functions for enhanced functionality
  const updateSubnetSelection = useCallback((subnetIds: string[], selected: boolean) => {
    try {
      setSelectedSubnets(prev => {
        const newSelected = new Set(prev);
        subnetIds.forEach(id => {
          if (selected) {
            newSelected.add(id);
          } else {
            newSelected.delete(id);
          }
        });
        return newSelected;
      });
    } catch (error) {
      setSubnetError(error instanceof Error ? error.message : 'Failed to update subnet selection');
    }
  }, []);

  const selectAllSubnets = useCallback(() => {
    try {
      const allSubnetIds = splitSubnets.map(subnet => subnet.id);
      setSelectedSubnets(new Set(allSubnetIds));
    } catch (error) {
      setSubnetError(error instanceof Error ? error.message : 'Failed to select all subnets');
    }
  }, [splitSubnets]);

  const clearSubnetSelection = useCallback(() => {
    try {
      setSelectedSubnets(new Set());
    } catch (error) {
      setSubnetError(error instanceof Error ? error.message : 'Failed to clear subnet selection');
    }
  }, []);

  const updateSubnetView = useCallback((view: 'list' | 'tree') => {
    try {
      setCurrentView(view);
    } catch (error) {
      setSubnetError(error instanceof Error ? error.message : 'Failed to update view');
    }
  }, []);

  const updateSubnetSort = useCallback((field: 'network' | 'cidr' | 'hosts' | 'created', order: 'asc' | 'desc') => {
    try {
      setSortBy(field);
      setSortOrder(order);
    } catch (error) {
      setSubnetError(error instanceof Error ? error.message : 'Failed to update sort');
    }
  }, []);

  const updateSubnetFilter = useCallback((filter: string) => {
    try {
      setFilterText(filter);
    } catch (error) {
      setSubnetError(error instanceof Error ? error.message : 'Failed to update filter');
    }
  }, []);

  const toggleNodeExpansion = useCallback((nodeId: string) => {
    try {
      setExpandedNodes(prev => {
        const newExpanded = new Set(prev);
        if (newExpanded.has(nodeId)) {
          newExpanded.delete(nodeId);
        } else {
          newExpanded.add(nodeId);
        }
        return newExpanded;
      });
    } catch (error) {
      setSubnetError(error instanceof Error ? error.message : 'Failed to toggle node expansion');
    }
  }, []);

  const undoLastOperation = useCallback(() => {
    try {
      if (splitHistory.length === 0) {
        setSubnetError('No operations to undo');
        return;
      }

      const lastOperation = splitHistory[splitHistory.length - 1];
      
      // Remove the last operation from history
      setSplitHistory(prev => prev.slice(0, -1));
      
      // Reverse the operation based on its type
      if (lastOperation.type === 'split') {
        // Remove the subnets that were added by the split
        const subnetIdsToRemove = lastOperation.resultSubnets.map(subnet => subnet.id);
        setSplitSubnets(prev => prev.filter(subnet => !subnetIdsToRemove.includes(subnet.id)));
        setSelectedSubnets(prev => {
          const newSelected = new Set(prev);
          subnetIdsToRemove.forEach(id => newSelected.delete(id));
          return newSelected;
        });
      } else if (lastOperation.type === 'join') {
        // Add back the subnets that were removed by the join
        setSplitSubnets(prev => [...prev, ...lastOperation.resultSubnets]);
      }
      
      setSubnetError(null);
    } catch (error) {
      setSubnetError(error instanceof Error ? error.message : 'Failed to undo operation');
    }
  }, [splitHistory]);

  const calculateSubnet = useCallback(() => {
    try {
      setError("");

      // Input validation with enhanced error handling
      if (!ipAddress || typeof ipAddress !== 'string') {
        setError("IP address is required");
        return;
      }

      if (!cidr || typeof cidr !== 'string') {
        setError("CIDR prefix is required");
        return;
      }

      // Enhanced IP validation with specific error messages
      if (!validateIP(ipAddress)) {
        if (ipVersion === "ipv4") {
          const parts = ipAddress.split(".");
          if (parts.length !== 4) {
            setError("IP address must have exactly 4 octets separated by dots");
          } else if (parts.some(part => part === "" || isNaN(parseInt(part)))) {
            setError("All IP address octets must be valid numbers");
          } else if (parts.some(part => parseInt(part) < 0 || parseInt(part) > 255)) {
            setError("IP address octets must be between 0 and 255");
          } else {
            setError("Invalid IP address format");
          }
        } else {
          setError("Invalid IPv6 address format");
        }
        return;
      }

      if (!validateCIDR(cidr)) {
        if (ipVersion === "ipv6") {
          setError("IPv6 CIDR must be between 0 and 128");
        } else if (mode === "normal") {
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

      // Handle IPv6 calculations
      if (ipVersion === "ipv6") {
        const cidrNum = parseInt(cidr);
        const ipv6Subnet = calculateIPv6Subnet(ipAddress, cidrNum);
        const ipv6Summary = getIPv6SubnetSummary(ipAddress, cidrNum);

        // Ensure IPv6 addresses are properly compressed for display
        const compressedNetwork = compressIPv6(ipv6Subnet.network);
        const compressedFirstHost = compressIPv6(ipv6Subnet.firstHost);
        const compressedLastHost = compressIPv6(ipv6Subnet.lastHost);

        const calculatedIPv6Subnet = {
          network: compressedNetwork,
          broadcast: "N/A (IPv6 has no broadcast address)",
          firstHost: compressedFirstHost,
          lastHost: compressedLastHost,
          subnetMask: "N/A (IPv6 uses prefix length)",
          wildcardMask: "N/A (IPv6 uses prefix length)",
          totalHosts: Number(ipv6Subnet.totalAddresses > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : ipv6Subnet.totalAddresses),
          usableHosts: Number(ipv6Subnet.usableAddresses > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : ipv6Subnet.usableAddresses),
          cidr: `/${cidr}`,
          // Store additional IPv6-specific information for enhanced display
          ipv6Info: {
            addressType: ipv6Summary.addressType,
            hostBits: ipv6Summary.hostBits,
            totalAddressesFormatted: ipv6Summary.totalAddresses,
            usableAddressesFormatted: ipv6Summary.usableAddresses
          }
        };

        setSubnetInfo(calculatedIPv6Subnet);
        setOriginalSubnet(calculatedIPv6Subnet); // Store original subnet for reset functionality
        return;
      }

      const cidrNum = parseInt(cidr);

      // Enhanced CIDR validation with edge case handling
      if (isNaN(cidrNum) || cidrNum < 0 || cidrNum > 32) {
        setError("CIDR prefix must be a number between 0 and 32");
        return;
      }

      const hostBits = 32 - cidrNum;

      // Handle edge case for /0 subnet (entire IPv4 space) - should be allowed in normal mode
      if (hostBits >= 32) {
        setError("Invalid subnet calculation: host bits exceed 32");
        return;
      }

      // Enhanced bitwise operations with overflow protection
      let subnetMask: number;
      let wildcardMask: number;

      try {
        subnetMask = hostBits >= 32 ? 0 : (0xFFFFFFFF << hostBits) >>> 0;
        wildcardMask = ~subnetMask >>> 0;

        // Validate mask calculations
        if (isNaN(subnetMask) || isNaN(wildcardMask)) {
          throw new Error("Invalid subnet mask calculation");
        }
      } catch (maskError) {
        console.error("Subnet mask calculation error:", maskError);
        setError("Error calculating subnet mask. Please verify your CIDR input.");
        return;
      }

      let ipInt: number;
      try {
        ipInt = ipToInt(ipAddress);

        // Enhanced IP conversion validation
        if (isNaN(ipInt) || ipInt < 0 || ipInt > 0xFFFFFFFF) {
          throw new Error("IP address conversion out of bounds");
        }
      } catch (ipError) {
        console.error("IP conversion error:", ipError);
        setError("Error converting IP address. Please check the format.");
        return;
      }

      let networkInt: number;
      let broadcastInt: number;

      try {
        networkInt = (ipInt & subnetMask) >>> 0;
        broadcastInt = (networkInt | wildcardMask) >>> 0;

        // Enhanced network calculation validation
        if (networkInt > broadcastInt) {
          throw new Error("Network address exceeds broadcast address");
        }

        if (isNaN(networkInt) || isNaN(broadcastInt)) {
          throw new Error("Invalid network address calculation");
        }
      } catch (networkError) {
        console.error("Network calculation error:", networkError);
        setError("Error calculating network addresses. Please verify your inputs.");
        return;
      }

      // Enhanced host calculation with overflow protection
      let totalHosts: number;
      let usableHosts: number;

      try {
        // Handle very large subnets more safely
        if (hostBits >= 31) {
          totalHosts = Math.pow(2, 31); // Cap at 2^31 to prevent overflow
        } else {
          totalHosts = Math.pow(2, hostBits);
        }

        // Validate total hosts calculation
        if (isNaN(totalHosts) || totalHosts < 0 || !isFinite(totalHosts)) {
          throw new Error("Invalid total hosts calculation");
        }

        // Calculate usable hosts with edge case handling
        if (hostBits === 0) {
          // /32 subnet - single host route
          usableHosts = 1;
        } else if (hostBits === 1) {
          // /31 subnet - point-to-point link (RFC 3021)
          usableHosts = 2;
        } else {
          // Traditional subnetting - subtract network and broadcast addresses
          usableHosts = Math.max(0, totalHosts - 2);
        }

      } catch (hostError) {
        console.error("Host calculation error:", hostError);
        setError("Error calculating host addresses. The subnet may be too large.");
        return;
      }

      const firstHostInt = networkInt + 1;
      const lastHostInt = broadcastInt - 1;

      let cloudReserved = undefined;
      let firstUsableHost: string;

      try {
        firstUsableHost = intToIp(firstHostInt);
      } catch (hostConversionError) {
        console.error("Host IP conversion error:", hostConversionError);
        setError("Error converting host IP addresses.");
        return;
      }

      // Enhanced cloud provider handling with comprehensive error checking
      if (mode !== "normal") {
        const provider = CLOUD_PROVIDERS[mode as keyof typeof CLOUD_PROVIDERS];
        if (provider) {
          try {
            // Validate that subnet is large enough for cloud provider requirements
            if (totalHosts < provider.reservedCount) {
              setError(`${provider.name} requires at least ${provider.reservedCount} IP addresses in the subnet (current: ${totalHosts})`);
              return;
            }

            usableHosts = Math.max(0, totalHosts - provider.reservedCount);

            // Enhanced validation for first usable offset
            const firstUsableOffset = networkInt + provider.firstUsableOffset;
            if (firstUsableOffset > broadcastInt || firstUsableOffset < networkInt) {
              setError(`${provider.name} subnet configuration error: insufficient IP addresses for required reservations`);
              return;
            }

            firstUsableHost = intToIp(firstUsableOffset);

            // Enhanced cloud reservation generation with error handling
            try {
              const reservations = provider.getReservations(networkInt, broadcastInt, intToIp);

              // Validate reservations
              if (!Array.isArray(reservations) || reservations.length === 0) {
                throw new Error("Invalid reservations generated");
              }

              // Validate each reservation
              reservations.forEach((reservation, index) => {
                if (!reservation.ip || !reservation.purpose || !reservation.description) {
                  throw new Error(`Invalid reservation at index ${index}`);
                }
              });

              cloudReserved = {
                provider: provider.name,
                reservations
              };
            } catch (reservationError) {
              console.error("Error generating cloud reservations:", reservationError);
              setError(`Error calculating ${provider.name} reserved IP addresses: ${reservationError instanceof Error ? reservationError.message : 'Unknown error'}`);
              return;
            }
          } catch (providerError) {
            console.error("Cloud provider calculation error:", providerError);
            setError(`Error processing ${provider.name} subnet requirements: ${providerError instanceof Error ? providerError.message : 'Unknown error'}`);
            return;
          }
        }
      }

      // Final comprehensive validation of all calculated values
      try {
        const networkAddress = intToIp(networkInt);
        const broadcastAddress = intToIp(broadcastInt);
        const subnetMaskAddress = intToIp(subnetMask);
        const wildcardMaskAddress = intToIp(wildcardMask);
        // Handle first and last host display for edge cases
        let firstHostDisplay: string;
        let lastHostDisplay: string;

        if (hostBits === 0) {
          // /32 subnet - single host route
          firstHostDisplay = networkAddress;
          lastHostDisplay = networkAddress;
        } else if (hostBits === 1) {
          // /31 subnet - point-to-point link (RFC 3021)
          firstHostDisplay = networkAddress;
          lastHostDisplay = intToIp(broadcastInt);
        } else {
          // Traditional subnetting
          firstHostDisplay = firstUsableHost;
          lastHostDisplay = intToIp(lastHostInt);
        }

        // Validate all IP conversions succeeded
        if (!networkAddress || !broadcastAddress || !subnetMaskAddress || !wildcardMaskAddress) {
          throw new Error("Failed to convert calculated addresses to IP format");
        }

        const calculatedSubnet = {
          network: networkAddress,
          broadcast: broadcastAddress,
          firstHost: firstHostDisplay,
          lastHost: lastHostDisplay,
          subnetMask: subnetMaskAddress,
          wildcardMask: wildcardMaskAddress,
          totalHosts: Math.floor(Math.min(totalHosts, Number.MAX_SAFE_INTEGER)), // Ensure safe integer
          usableHosts: Math.floor(Math.min(usableHosts, Number.MAX_SAFE_INTEGER)), // Ensure safe integer
          cidr: `/${cidr}`,
          cloudReserved
        };

        setSubnetInfo(calculatedSubnet);
        setOriginalSubnet(calculatedSubnet); // Store original subnet for reset functionality

      } catch (finalError) {
        console.error("Final validation error:", finalError);
        setError(`Error finalizing subnet calculation: ${finalError instanceof Error ? finalError.message : 'Unknown error'}`);
        setSubnetInfo(null);
        return;
      }

    } catch (error) {
      console.error("Unexpected subnet calculation error:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setError(`An unexpected error occurred during subnet calculation: ${errorMessage}. Please check your inputs and try again.`);
      setSubnetInfo(null);
    }
  }, [ipAddress, cidr, mode, ipVersion, validateCIDR, validateIP]);

  useEffect(() => {
    if (ipAddress && cidr) {
      calculateSubnet();
    }
  }, [ipAddress, cidr, mode, ipVersion, calculateSubnet]);

  // Reset subnet management when main calculation changes
  useEffect(() => {
    resetSubnetManagement();
  }, [ipAddress, cidr, mode, ipVersion, resetSubnetManagement]);

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
          Network planning tool for IPv4/IPv6 subnetting, AWS, Azure and Google Cloud.
        </p>
        <p className="text-sm text-muted-foreground">
          From Dan Jones at the <a href="https://artofinfra.com" className="text-primary hover:text-primary/80 hover:underline" target="_blank" rel="noopener noreferrer">artofinfra.com</a> blog
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Network Input</CardTitle>
          <CardDescription>
            {ipVersion === "ipv4" 
              ? "Enter an IP address and CIDR notation to calculate subnet details"
              : "Enter an IPv6 address and prefix length to calculate subnet details. Cloud providers use standardized /64 prefixes for IPv6 subnets."
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2 flex-1">
              <Label htmlFor="ipVersion">IP Version</Label>
              <Select value={ipVersion} onValueChange={(value: IPVersion) => {
                setIpVersion(value);
                // Update default values when switching IP versions
                if (value === "ipv4") {
                  setIpAddress("192.168.1.0");
                  setCidr("24");
                } else {
                  setIpAddress("2001:db8::1");
                  setCidr("64");
                }
              }}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select IP version" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ipv4">IPv4</SelectItem>
                  <SelectItem value="ipv6">IPv6</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 flex-1">
              <Label htmlFor="ip">IP Address</Label>
              <Input
                id="ip"
                type="text"
                placeholder={ipVersion === "ipv4" ? "192.168.1.0" : "2001:db8::1"}
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
                max={ipVersion === "ipv4" ?
                  (mode === "normal" ? "32" : CLOUD_PROVIDERS[mode as keyof typeof CLOUD_PROVIDERS]?.maxCidr || "32") :
                  "128"
                }
                placeholder={ipVersion === "ipv4" ? "24" : "64"}
                value={cidr}
                onChange={(e) => setCidr(e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2 flex-1">
              <Label htmlFor="mode">Mode</Label>
              <Select value={mode} onValueChange={setMode} disabled={ipVersion === "ipv6"}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal Subnetting</SelectItem>
                  {ipVersion === "ipv4" && (
                    <>
                      <SelectItem value="aws">AWS VPC Mode</SelectItem>
                      <SelectItem value="azure">Azure VNet Mode</SelectItem>
                      <SelectItem value="gcp">Google Cloud VPC Mode</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
              {ipVersion === "ipv6" && (
                <p className="text-xs text-muted-foreground">
                  Cloud providers use fixed /64 prefixes for IPv6 subnets
                </p>
              )}
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
                {(() => {
                  const cidrNum = parseInt(cidr);
                  let description = `Calculated network details for ${ipAddress}/${cidr}`;
                  
                  if (ipVersion === "ipv4") {
                    if (cidrNum === 32) {
                      description += " (Host Route - Single IP address)";
                    } else if (cidrNum === 31) {
                      description += " (Point-to-Point Link - RFC 3021)";
                    }
                    
                    if (mode !== "normal") {
                      description += ` (${CLOUD_PROVIDERS[mode as keyof typeof CLOUD_PROVIDERS]?.name} Mode)`;
                    }
                  } else if (ipVersion === "ipv6") {
                    description += " (IPv6 Subnet)";
                  }
                  
                  return description;
                })()}
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
                    <TableCell className="font-medium">
                      {ipVersion === "ipv6" ? "Total Addresses" : "Total Hosts"}
                    </TableCell>
                    <TableCell>
                      {subnetInfo.ipv6Info ? 
                        subnetInfo.ipv6Info.totalAddressesFormatted : 
                        subnetInfo.totalHosts.toLocaleString()
                      }
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">
                      {ipVersion === "ipv6" ? "Usable Addresses" : "Usable Hosts"}
                    </TableCell>
                    <TableCell>
                      {subnetInfo.ipv6Info ? 
                        subnetInfo.ipv6Info.usableAddressesFormatted : 
                        subnetInfo.usableHosts.toLocaleString()
                      }
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">CIDR Notation</TableCell>
                    <TableCell>{subnetInfo.network}{subnetInfo.cidr}</TableCell>
                  </TableRow>
                  {subnetInfo.ipv6Info && (
                    <>
                      <TableRow>
                        <TableCell className="font-medium">Address Type</TableCell>
                        <TableCell>{subnetInfo.ipv6Info.addressType}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Host Bits</TableCell>
                        <TableCell>{subnetInfo.ipv6Info.hostBits} bits</TableCell>
                      </TableRow>
                    </>
                  )}
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

          {/* Subnet Management Section */}
          {subnetInfo && ipVersion === "ipv4" && (
            <SubnetSplitter
              parentSubnet={{
                ...subnetInfo,
                id: subnetInfo.network + subnetInfo.cidr,
                level: 0
              }}
              ipVersion={ipVersion}
              cloudMode={mode as CloudMode}
              onSplit={addSplitSubnets}
              onError={(error: SubnetError) => setSubnetError(error.message)}
              disabled={isSubnetLoading}
              maxSubnets={1000}
            />
          )}

          {/* Subnet Joiner Section */}
          {splitSubnets.length > 0 && ipVersion === "ipv4" && (
            <SubnetJoiner
              availableSubnets={splitSubnets}
              selectedSubnets={selectedSubnets}
              ipVersion={ipVersion}
              onSelectionChange={setSelectedSubnets}
              onJoin={(joinedSubnet, operation) => {
                // Remove the joined subnets from the list
                const subnetIdsToRemove = operation.sourceSubnets;
                removeSubnets(subnetIdsToRemove, operation);
                
                // Add the new joined subnet
                addSplitSubnets([joinedSubnet], {
                  ...operation,
                  type: 'join',
                  resultSubnets: [joinedSubnet]
                });
              }}
              onError={(error: SubnetError) => setSubnetError(error.message)}
              disabled={isSubnetLoading}
            />
          )}

          {/* Subnet Hierarchy Visualization */}
          {splitSubnets.length > 0 && (
            <SubnetTree
              subnets={splitSubnets}
              selectedSubnets={selectedSubnets}
              onSelectionChange={setSelectedSubnets}
              onCopySubnet={async (subnet) => {
                try {
                  const subnetInfo = `Network: ${subnet.network}/${subnet.cidr}
Broadcast: ${subnet.broadcast}
First Host: ${subnet.firstHost}
Last Host: ${subnet.lastHost}
Total Hosts: ${subnet.totalHosts.toLocaleString()}
Usable Hosts: ${subnet.usableHosts.toLocaleString()}`;
                  
                  await navigator.clipboard.writeText(subnetInfo);
                  // Could add a toast notification here in the future
                } catch (error) {
                  console.error('Failed to copy subnet information:', error);
                  setSubnetError('Failed to copy subnet information to clipboard');
                }
              }}
              showRelationships={true}
              showSelection={true}
              showActions={true}
              loading={isSubnetLoading}
            />
          )}
        </>
      )}
    </div>
  );
}