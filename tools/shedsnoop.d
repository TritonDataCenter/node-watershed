#!/usr/sbin/dtrace -Zqs

#pragma D option	strsize=8k
#pragma D option	switchrate=10hz


watershed*:::recv-*,
watershed*:::send-*
{
	this->rem = copyinstr(arg0);
	this->buf = stringof(copyin(arg2, arg3));
	printf("%12s - %20s :: %s\n", probename, this->rem, this->buf);
}

watershed*:::start
{
	printf("%12s - %20s :: %s\n", probename, copyinstr(arg0),
	    copyinstr(arg2));
}

watershed*:::end
{
	printf("%12s - %20s :: %s %s\n", probename, copyinstr(arg0),
	    copyinstr(arg2), copyinstr(arg3));
}

