#!/usr/sbin/dtrace -Zqs

#pragma D option	strsize=8k
#pragma D option	switchrate=10hz

watershed*:::recv-text,
watershed*:::send-text
{
	printf("[%5d/%3d] %12s :: %s\n", pid, arg0, probename,
	    copyinstr(arg3));
}

watershed*:::recv-binary,
watershed*:::recv-ping,
watershed*:::recv-pong,
watershed*:::recv-close,
watershed*:::send-binary,
watershed*:::send-ping,
watershed*:::send-pong,
watershed*:::send-close,
watershed*:::read-buffer
{
	printf("[%5d/%3d] %12s :: (len %d)\n", pid, arg0, probename, arg4);
	tracemem(copyin(arg3, arg4), 4000, arg4);
}

watershed*:::send-close
{
	jstack(100, 8000);
}

watershed*:::start
{
	printf("[%5d/%3d] %12s :: local %20s remote %20s\n", pid, arg0, probename,
	    copyinstr(arg2), copyinstr(arg1));
}

watershed*:::end
{
	printf("[%5d/%3d] %12s :: %s %s\n", pid, arg0, probename,
	    copyinstr(arg3), copyinstr(arg4));
	jstack(100, 8000);
}
